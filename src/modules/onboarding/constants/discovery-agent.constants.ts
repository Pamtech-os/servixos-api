import type Anthropic from '@anthropic-ai/sdk';
import type { ClassConstructor } from 'class-transformer';
import {
  BrandInput,
  ConceptInput,
  ExistingBusinessInput,
  OpportunitiesInput,
  PersonProfileInput,
  PlanInput,
  ServicesInput,
  WorkflowsInput,
} from '../dto/profile-sections.dto';
import {
  PriceUnit,
  ProfileSection,
  StartingPoint,
} from '../schemas/onboarding-session.schema';

export const DISCOVERY_DEFAULT_MODEL = 'claude-opus-5-5';
export const DISCOVERY_MAX_TOKENS = 16000;
/** Upper bound on model round-trips per user message (tool call → result → continue). */
export const DISCOVERY_MAX_ITERATIONS = 6;
/** Recent turns replayed to the model; the structured profile carries older context. */
export const DISCOVERY_HISTORY_TURNS = 30;
/** Turns kept on the session document for the transcript UI. */
export const DISCOVERY_STORED_TURNS = 200;
export const DISCOVERY_CHAT_LOCK_TTL_SECONDS = 180;
export const SET_STARTING_POINT_TOOL = 'set_starting_point';
export const DRAFT_WEBSITE_TOOL = 'draft_website';

const text = (description: string, maxLength = 2000) => ({
  type: 'string',
  description,
  maxLength,
});
const textList = (description: string, maxItems = 20) => ({
  type: 'array',
  description,
  maxItems,
  items: { type: 'string', maxLength: 200 },
});
const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});

export interface SectionDefinition {
  section: ProfileSection;
  input: ClassConstructor<object>;
  tool: Anthropic.Tool;
}

// eager_input_streaming is deliberately off: inputs are small JSON objects, so the
// server-side buffering costs little and keeps the API's input validation.
const sectionTool = (
  name: string,
  description: string,
  inputSchema: ReturnType<typeof objectSchema>,
): Anthropic.Tool => ({
  name,
  description,
  input_schema: inputSchema,
});

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    section: ProfileSection.PERSON,
    input: PersonProfileInput,
    tool: sectionTool(
      'save_person_profile',
      'Save what you have learned about the person: interests, skills, experience, goals, available time and budget, preferred industries and business models, and concerns. Send the full current picture each time (it replaces the previous version), merging new details with what is already saved.',
      objectSchema({
        interests: textList('Interests and passions'),
        skills: textList('Skills they have'),
        experience: text(
          'Relevant work or life experience, in a sentence or two',
        ),
        goals: textList('Personal and professional goals'),
        weeklyHours: {
          type: 'integer',
          minimum: 0,
          maximum: 168,
          description: 'Hours per week they can commit',
        },
        budgetAmount: {
          type: 'number',
          minimum: 0,
          description: "Starting budget in the user's local currency",
        },
        preferredIndustries: textList('Industries they are drawn to'),
        preferredBusinessModels: textList(
          'Business models they prefer, e.g. services, online, subscription',
        ),
        concerns: textList('Worries, challenges, or expectations they raised'),
      }),
    ),
  },
  {
    section: ProfileSection.EXISTING_BUSINESS,
    input: ExistingBusinessInput,
    tool: sectionTool(
      'save_existing_business',
      'Save details of a business the user already runs: what it does, customers, current services and pricing, challenges, and growth goals. Replaces the previous version.',
      objectSchema(
        {
          description: text('What the business does today'),
          customers: text('Who its customers are'),
          currentServices: textList('Services or products offered today'),
          currentPricing: text('How they price today'),
          challenges: textList('Current challenges'),
          growthGoals: textList('What they want to grow or improve'),
        },
        ['description'],
      ),
    ),
  },
  {
    section: ProfileSection.OPPORTUNITIES,
    input: OpportunitiesInput,
    tool: sectionTool(
      'propose_opportunities',
      'Propose 2-5 business opportunities suited to someone without an idea yet, each with why it fits them, an estimated startup cost range, risks and trade-offs. Set selectedIndex only once the user has chosen one.',
      objectSchema(
        {
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: objectSchema(
              {
                title: text('Short name of the opportunity', 200),
                summary: text('What the business would do'),
                whyItFits: text("Why it fits this person's profile"),
                estimatedStartupCost: text(
                  'Rough startup cost range in local currency, e.g. "₦150k–₦400k"',
                  200,
                ),
                risks: textList('Main risks'),
                tradeOffs: textList('Trade-offs to weigh'),
              },
              ['title', 'summary', 'whyItFits', 'estimatedStartupCost'],
            ),
          },
          selectedIndex: {
            type: 'integer',
            minimum: 0,
            maximum: 4,
            description: 'Index of the opportunity the user chose',
          },
        },
        ['items'],
      ),
    ),
  },
  {
    section: ProfileSection.CONCEPT,
    input: ConceptInput,
    tool: sectionTool(
      'save_concept',
      'Save the business concept: a summary, the value proposition, target customers and industry. Replaces the previous version.',
      objectSchema(
        {
          summary: text('One-paragraph description of the business'),
          valueProposition: text('Why customers would choose it'),
          targetCustomers: textList('Target customer groups'),
          industry: text('Industry or category', 200),
        },
        ['summary', 'valueProposition'],
      ),
    ),
  },
  {
    section: ProfileSection.BRAND,
    input: BrandInput,
    tool: sectionTool(
      'save_brand',
      'Save the brand identity: business name, tagline, colours (hex), font and tone of voice. Replaces the previous version.',
      objectSchema(
        {
          name: text('Business name', 80),
          tagline: text('Short tagline', 200),
          primaryColor: {
            type: 'string',
            description: 'Hex colour, e.g. #2563eb',
          },
          secondaryColor: { type: 'string', description: 'Hex colour' },
          font: text('A widely available web font, e.g. Inter', 60),
          tone: text('Tone of voice, e.g. warm and professional', 200),
        },
        ['name'],
      ),
    ),
  },
  {
    section: ProfileSection.SERVICES,
    input: ServicesInput,
    tool: sectionTool(
      'save_services',
      "Save the services the business will offer with proposed prices in the user's local currency. Prices are suggestions for the user to adjust. Replaces the previous version.",
      objectSchema(
        {
          currency: {
            type: 'string',
            description: 'ISO 4217 currency code, e.g. NGN, GBP, USD, CAD',
          },
          items: {
            type: 'array',
            maxItems: 20,
            items: objectSchema(
              {
                name: text('Service name', 200),
                description: text('What the customer gets'),
                price: {
                  type: 'number',
                  minimum: 0,
                  description: 'Proposed price in major units',
                },
                priceUnit: {
                  type: 'string',
                  enum: Object.values(PriceUnit),
                },
              },
              ['name', 'description'],
            ),
          },
        },
        ['currency', 'items'],
      ),
    ),
  },
  {
    section: ProfileSection.WORKFLOWS,
    input: WorkflowsInput,
    tool: sectionTool(
      'save_workflows',
      'Save the initial operational workflows, e.g. how a customer request becomes a booked and paid job. Replaces the previous version.',
      objectSchema(
        {
          items: {
            type: 'array',
            maxItems: 10,
            items: objectSchema(
              {
                name: text('Workflow name', 200),
                steps: textList('Ordered steps'),
              },
              ['name', 'steps'],
            ),
          },
        },
        ['items'],
      ),
    ),
  },
  {
    section: ProfileSection.PLAN,
    input: PlanInput,
    tool: sectionTool(
      'save_plan',
      'Save business goals and an initial action plan. Each action explains why it matters. Replaces the previous version.',
      objectSchema(
        {
          goals: textList('Business goals for the first months', 10),
          actions: {
            type: 'array',
            maxItems: 20,
            items: objectSchema(
              {
                title: text('Action to take', 200),
                why: text('Why this action matters'),
                timeframe: text('When, e.g. "Week 1"', 200),
              },
              ['title', 'why'],
            ),
          },
        },
        ['goals', 'actions'],
      ),
    ),
  },
];

// Hash map — O(1) lookup of a section definition by tool name or section key
export const SECTION_BY_TOOL = new Map(
  SECTION_DEFINITIONS.map((d) => [d.tool.name, d]),
);
export const SECTION_BY_KEY = new Map(
  SECTION_DEFINITIONS.map((d) => [d.section as string, d]),
);

export const DISCOVERY_TOOLS: Anthropic.Tool[] = [
  {
    name: SET_STARTING_POINT_TOOL,
    description:
      "Record the user's starting point once it is clear: no_idea (wants help finding a business), has_idea (has an idea to develop), or existing_business (already runs one).",
    input_schema: objectSchema(
      {
        startingPoint: { type: 'string', enum: Object.values(StartingPoint) },
      },
      ['startingPoint'],
    ),
  },
  ...SECTION_DEFINITIONS.map((d) => d.tool),
  {
    name: DRAFT_WEBSITE_TOOL,
    description:
      'Generate or refresh the live website preview from the saved concept, brand and services. Requires a saved concept and brand. Pass instructions to apply changes the user asked for, e.g. "warmer hero, mention same-day service".',
    input_schema: objectSchema({
      instructions: text('Changes the user requested for the website', 1000),
    }),
  },
];

export const DISCOVERY_SYSTEM_PROMPT = `You are the ServixOS business guide: a friendly, practical entrepreneurship coach inside the ServixOS onboarding workspace. ServixOS is an AI Entrepreneurship Operating System that helps people discover, start, run and grow service businesses. Many users have little or no business experience, and some do not yet know what business to start.

Your job in this conversation is to understand the person, find the right opportunity with them, and build their business setup step by step. The flow is:

1. Understand the person — interests, skills, experience, goals, weekly time, budget, preferred industries and business models, concerns. Have a natural conversation: ask one or two questions at a time and adapt follow-ups to their answers rather than running through a questionnaire.
2. Identify their starting point and record it with set_starting_point:
   - no_idea: explore suitable opportunities based on their profile and the realities of their market. Explain startup costs, risks and trade-offs, then let them choose (propose_opportunities).
   - has_idea: validate and refine it, identify target customers, shape services and a practical business model.
   - existing_business: learn its operations, customers, services, pricing, challenges and growth goals (save_existing_business), then recommend improvements.
3. Build the business progressively: concept and target customers, name and brand, services with proposed pricing, a website (draft_website shows a live preview the user can see), initial workflows, goals and an action plan.

How to work:
- Save structured information with the save_* tools as soon as you learn it, so the user sees their profile take shape in the side panel. Each save replaces that section, so always send the complete current version, merged with what is already saved (shown below).
- Everything you save is a draft. The user reviews, edits and approves each section in the panel. Sections marked approved were confirmed by the user — change them only when the user asks, and tell them they will need to re-approve.
- When you save a section, briefly tell the user what you drafted and invite changes. Do not paste the whole section back into the chat; the panel shows it.
- Use the user's local currency for budgets, costs and prices, and keep the local market in mind (for example, affordability matters a great deal for many Nigerian customers).
- Be honest about uncertainty. Present ideas, startup costs, prices and any revenue figures as estimates or suggestions to validate, never as guaranteed outcomes.
- Explain why a recommendation matters in one sentence when it is not obvious.
- Keep replies short and conversational — a few sentences, with a short list only when comparing options. Write plain text with light Markdown.
- Stay focused on the user's business. If asked about something unrelated, steer back politely.
- Once concept and brand are saved, offer to draft the website. When the user asks for website changes, call draft_website with their requested changes as instructions.
- When concept, brand and services are drafted, suggest the user review and approve them so their business can be created. The goals and action plan become their first tasks in the Online Office.`;
