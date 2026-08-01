import { Injectable, OnModuleInit } from '@nestjs/common';
// 🌟 Direct model instance compatible with Gemini API Key
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'; 
import { AnalyticsService } from '../analytics/analytics.service';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
// 🛠️ Import all three analytics tools
import { createOrderStatsTool, createTopItemsTool, createFullSnapshotTool } from './tools/analytics.tool';
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userContext: Annotation<{ restaurantId?: string; branchId?: string; role: string; id: string }>({
    reducer: (x, y) => y,
    default: () => ({ role: 'OWNER', id: '' }),
  }),
});

@Injectable()
export class AiAgentService implements OnModuleInit {
  private model: any;
  private toolsMap: Record<string, any> = {};
  private graphRunnable: any;

  constructor(private readonly analyticsService: AnalyticsService) {}

  onModuleInit() {
    // 🌟 Initialize the Gemini model with API Key configuration
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash', // Latest stable Gemini model
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY,
    });

    // 🔄 Register all available tools in the execution array
    const tools = [
      createOrderStatsTool(this.analyticsService),  // 📊 Tool 1: General order statistics summary
      createTopItemsTool(this.analyticsService),    // 🍔 Tool 2: Top-selling items
      createFullSnapshotTool(this.analyticsService), // 📈 Tool 3: Full analytics snapshot
    ];

    // Bind tools to the model so it recognizes their schemas and parameters
    this.model = this.model.bindTools(tools);
    
    // Build tool map for dynamic execution based on tool_calls name
    for (const tool of tools) {
      this.toolsMap[tool.name] = tool;
    }

    this.graphRunnable = this.buildAgentGraph();
  }

  private buildAgentGraph() {
    const graph = new StateGraph(AgentStateAnnotation);

    graph.addNode('agent_node', async (state) => {
      const response = await this.model.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        ...state.messages
      ]);
      return { messages: [response] };
    });

    graph.addNode('tools_node', async (state) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      const toolCalls = lastMessage.tool_calls || [];
      const toolOutputs: BaseMessage[] = [];

      for (const call of toolCalls) {
        const tool = this.toolsMap[call.name];
        if (tool) {
          
          // 🛡️ Strict security layer for tool arguments (Multi-tenant isolation)
          let finalBranchId = call.args.branchId;

          // Restriction 1: Branch Manager is strictly scoped to their assigned branchId
          if (state.userContext.role === 'BRANCH_MANAGER') {
            finalBranchId = state.userContext.branchId;
          } 
          // Restriction 2: Owner can query any branch, but restaurantId remains strictly locked
          else if (state.userContext.role === 'OWNER') {
            finalBranchId = call.args.branchId;
          }

          const secureArgs = { 
            ...call.args, // Dynamic operational parameters passed by the AI (e.g., limits, filters)
            restaurantId: state.userContext.restaurantId, // Enforce multi-tenant restaurant isolation lock
            branchId: finalBranchId // Sanitized and validated branch identifier
          };
          
          // Invoke tool safely with sanitized arguments
          const resultText = await tool.invoke(secureArgs);
          
          toolOutputs.push(new ToolMessage({ 
            content: resultText, 
            name: call.name,
            tool_call_id: call.id 
          }));
        }
      }
      return { messages: toolOutputs };
    });

    graph.addEdge(START, 'agent_node' as any);

    graph.addConditionalEdges(
      'agent_node' as any, 
      (state) => {
        const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
        if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
          return 'tools_node';
        }
        return '__end__'; 
      },
      {
        tools_node: 'tools_node',
        __end__: END
      } as any
    );

    graph.addEdge('tools_node' as any, 'agent_node' as any);

    return graph.compile();
  }

  async processQuery(userMessage: string, user: any): Promise<{ answer: string }> {
    const initialState = {
      messages: [new HumanMessage(userMessage)],
      userContext: { 
        restaurantId: user.restaurantId, 
        branchId: user.branchId, 
        role: user.role,
        id: user.id
      },
    };

    const finalState = await this.graphRunnable.invoke(initialState);
    const lastMessage = finalState.messages[finalState.messages.length - 1];

    return { answer: lastMessage.content as string };
  }
}
