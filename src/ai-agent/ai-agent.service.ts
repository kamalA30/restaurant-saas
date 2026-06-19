import { Injectable, OnModuleInit } from '@nestjs/common';
// 🌟 العودة للمحرك المباشر المتوافق مع مفتاح Gemini API في لوحة التحكم
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'; 
import { AnalyticsService } from '../analytics/analytics.service';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
// 🛠️ استيراد الأدوات الثلاث بالكامل
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
    // 🌟 تشغيل الموديل المتوافق 100% مع صلاحية الـ Gemini API والنسخة المستقرة
    this.model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash', // الاصدار الأحدث والمدفوع في حسابك
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY,
    });

    // 🔄 تأكيد تسجيل الأدوات الثلاث معاً في مصفوفة التشغيل
    const tools = [
      createOrderStatsTool(this.analyticsService),  // 📊 الأداة 1: ملخص الإحصائيات العامة
      createTopItemsTool(this.analyticsService),    // 🍔 الأداة 2: الأطباق الأعلى مبيعاً
      createFullSnapshotTool(this.analyticsService), // 📈 الأداة 3: التقرير التحليلي الشامل
    ];

    // ربط الأدوات الثلاث بالموديل ليتعرف على الـ Schemas والـ Parameters الخاصة بها
    this.model = this.model.bindTools(tools);
    
    // بناء الخريطة البرمجية لاستدعاء الأدوات ديناميكياً بناءً على الاسم الممرر من الـ AI
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
          
          // 🛡️ طبقة الحماية الصارمة لوسائط الأدوات (🔐 بقيت كما هي دون لمس لضمان الأمان)
          let finalBranchId = call.args.branchId;

          // القيد الأول: مدير الفرع يُحجز ويُقيد داخل فرعه المعين عليه حتماً ولن يرى غيره
          if (state.userContext.role === 'BRANCH_MANAGER') {
            finalBranchId = state.userContext.branchId;
          } 
          // القيد الثاني: المالك يرى فروع مطعمه فقط، ونعتمد على ما يستنتجه الـ AI للفرع بشرط قفل الـ restaurantId
          else if (state.userContext.role === 'OWNER') {
            finalBranchId = call.args.branchId;
          }

          const secureArgs = { 
            ...call.args, // المتغيرات التشغيلية الأخرى القادمة من الـ AI (مثل التواريخ أو الفلاتر والـ limit)
            restaurantId: state.userContext.restaurantId, // قفل عزل المطعم الأساسي للمالك والمدير
            branchId: finalBranchId // الفلتر الجغرافي الآمن والمطهر والمحمي من الـ Injection
          };
          
          // استدعاء الأداة المختارة بأمان تام بعد تطهير المدخلات
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