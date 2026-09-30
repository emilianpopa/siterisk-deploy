import { z } from "zod";

export const RISK_CATEGORIES = ["planning", "community", "air", "noise", "water", "grid", "ecology", "regulatory"] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_LABELS: Record<RiskCategory, string> = {
  planning: "Planning permission",
  community: "Community opposition",
  air: "Air quality (backup generation)",
  noise: "Noise & vibration",
  water: "Water resources",
  grid: "Grid capacity",
  ecology: "Green Belt, landscape & ecology",
  regulatory: "Legal challenge & regulation",
};

export interface CompanyProfile {
  companyName: string;
  industry: string;
  headquarters: string;
}

export interface Place {
  lat: number;
  lng: number;
  label: string;
  locality: string;
  area: string;
  localAuthority: string;
  nation: string;
  postcode?: string;
  displayName?: string;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  snippet: string;
  date?: string;
  imageUrl?: string;
  kind: "news" | "social" | "web" | "reference";
  platform: string;
  purpose: "community" | "precedent" | "legal" | "reference";
}

const stage = z.enum(["pre-application", "application", "pre-construction", "construction", "operation"]);
const riskCategory = z.enum(RISK_CATEGORIES);

export const LegalSchema = z.object({
  regime: z.string().describe("Most likely consenting route, e.g. 'Full planning application to the local planning authority (TCPA 1990)' or 'Development Consent Order (Planning Act 2008, via s.35 direction)'"),
  planningAuthority: z.string(),
  summary: z.string().describe("3-4 sentence plain-English summary for a Chief Risk Officer"),
  requirements: z.array(
    z.object({
      title: z.string(),
      instrument: z.string().describe("Statute, regulation or policy, e.g. 'Town and Country Planning (EIA) Regulations 2017'"),
      authority: z.string().describe("Body that grants or enforces it"),
      description: z.string().describe("What must be done and why it applies to this project"),
      stage,
      status: z.enum(["mandatory", "likely", "conditional"]),
      compliance: z
        .enum(["compliant", "non-compliant", "uncertain"])
        .describe("Current position of THIS project at THIS site: compliant = already satisfied or the site/proposal clearly meets it; non-compliant = not yet satisfied (e.g. consent or permit not obtained) or the site/proposal conflicts with it; uncertain = depends on information not yet available"),
      complianceNote: z.string().describe("One sentence: why, and what would make it compliant"),
      typicalTimeline: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  localPolicies: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      implication: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
});
export type Requirement = z.infer<typeof LegalSchema>["requirements"][number] & { id: string };
export type Compliance = Requirement["compliance"];
export type Legal = Omit<z.infer<typeof LegalSchema>, "requirements"> & { requirements: Requirement[] };

export const CommunitySchema = z.object({
  label: z.string().describe("Short headline for overall public mood, e.g. 'Organised local opposition'"),
  summary: z.string().describe("4-6 sentence synthesis of public sentiment towards a data centre here"),
  sourceSentiments: z.array(
    z.object({
      sourceId: z.string(),
      sentiment: z.enum(["positive", "neutral", "negative"]),
      stance: z.string().describe("One line: what this source says about data centres here"),
      scope: z.enum(["local", "regional", "national"]).describe("local = this site/town/district; regional = same county or region; national = elsewhere in the UK, used as an analogue"),
    }),
  ),
  mobilisation: z.object({
    level: z.enum(["none", "latent", "emerging", "organised", "intense"]).describe("How organised public opposition (or support) is near this site"),
    summary: z.string().describe("2-3 sentences on who is mobilising, how, and how fast it is growing"),
    groups: z.array(
      z.object({
        name: z.string().describe("Campaign group, parish council, residents' association, MP, NGO…"),
        stance: z.enum(["oppose", "support", "mixed"]),
        activity: z.string().describe("What they are doing"),
        scale: z.string().describe("Concrete size signals, e.g. '230 sign-ups, town hall at capacity', '1,300 objections'"),
        sourceIds: z.array(z.string()),
      }),
    ),
    signals: z.array(
      z.object({
        type: z.enum(["public meeting", "petition", "protest", "campaign fund", "legal challenge", "political opposition", "formal objections", "media campaign", "community benefit offer", "local support"]),
        detail: z.string(),
        scope: z.enum(["local", "regional", "national"]),
        sourceIds: z.array(z.string()),
      }),
    ),
    designationsCited: z.array(z.string()).describe("Protected landscapes/designations campaigners invoke, e.g. 'Green Belt', 'UNESCO Biosphere', 'National Landscape (AONB)'"),
  }),
  riskTransmission: z.array(
    z.object({
      mechanism: z.string().describe("How sentiment turns into project risk, e.g. 'Organised objections push the decision to planning committee and raise refusal odds'"),
      riskCategory: z.enum(RISK_CATEGORIES),
      direction: z.enum(["increases", "decreases"]),
      magnitude: z.enum(["low", "medium", "high"]),
      evidence: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  keyVoices: z.array(
    z.object({
      text: z.string().describe("Short quote or close paraphrase from the source"),
      who: z.string().describe("e.g. 'Local residents group', 'Council leader', 'Reddit user'"),
      sourceId: z.string(),
    }),
  ),
  themes: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
      riskCategory: riskCategory.describe("Risk category this theme most affects"),
      sourceIds: z.array(z.string()).describe("Every source that discusses this theme"),
    }),
  ),
});
export type Theme = z.infer<typeof CommunitySchema>["themes"][number] & { id: string };
export type Community = Omit<z.infer<typeof CommunitySchema>, "themes"> & {
  themes: Theme[];
  score: number;
  basis: "local" | "all";
  mix: { positive: number; neutral: number; negative: number };
};

export const PrecedentSchema = z.object({
  summary: z.string().describe("What past decisions tell us about the chance of consent here"),
  precedents: z.array(
    z.object({
      name: z.string(),
      location: z.string(),
      operator: z.string(),
      status: z.enum(["approved", "refused", "pending", "withdrawn", "called-in", "appeal", "quashed"]),
      year: z.string(),
      decisionBy: z.string().describe("Council, Planning Inspectorate, Secretary of State, High Court…"),
      keyReasons: z.array(z.string()),
      advice: z
        .array(z.string())
        .describe("1-3 recommendations addressed to the company in an advisory voice, each a concrete action with the reason from this precedent, e.g. 'Commission a landscape and visual impact assessment before pre-application — this scheme was refused on visual harm to the Green Belt.'"),
      lat: z.number(),
      lng: z.number(),
      sourceIds: z.array(z.string()),
    }),
  ),
});
export type Precedents = z.infer<typeof PrecedentSchema>;

export const RiskSchema = z.object({
  approvalLikelihood: z.number().describe("0-100 estimated probability of obtaining consent on first attempt"),
  summary: z.string().describe("3 sentence bottom line for the CRO"),
  risks: z.array(
    z.object({
      category: riskCategory,
      likelihood: z.number().describe("Integer 1-5"),
      impact: z.number().describe("Integer 1-5"),
      why: z.string().describe("2-3 sentences explaining the rating with evidence"),
      sentimentEffect: z.string().describe("One sentence on how public sentiment and mobilisation change this risk, or 'Little direct effect'"),
      drivers: z.array(z.string()),
      confidence: z.enum(["low", "medium", "high"]),
      sourceIds: z.array(z.string()),
    }),
  ),
});
export type Risk = z.infer<typeof RiskSchema>["risks"][number] & { score: number };
export type Risks = Omit<z.infer<typeof RiskSchema>, "risks"> & { risks: Risk[]; overall: number };

export const PlanSchema = z.object({
  actions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      phase: stage,
      priority: z.enum(["critical", "high", "medium", "low"]),
      track: z
        .enum(["consent", "technical", "sentiment", "social-initiative", "monitoring"])
        .describe("consent = planning/legal/permits; technical = design and engineering; sentiment = influencing public opinion (engagement, communications, allies); social-initiative = tangible benefits for the community; monitoring = tracking sentiment and risk"),
      owner: z.string().describe("Accountable role, e.g. 'Head of Planning', 'Community Relations Lead'"),
      timeline: z.string(),
      mitigates: z.array(
        z.object({
          category: riskCategory,
          likelihoodReduction: z.number().describe("Integer 1-2: how many likelihood points this action removes"),
        }),
      ),
      requirementIds: z.array(z.string()),
      themeIds: z.array(z.string()),
    }),
  ),
});
export type Action = z.infer<typeof PlanSchema>["actions"][number] & { id: string };
export type Plan = { actions: Action[] };

export type AssessEvent =
  | { type: "step"; step: StepId; state: "running" | "done" | "error"; message?: string }
  | { type: "sources"; data: Source[] }
  | { type: "legal"; data: Legal }
  | { type: "community"; data: Community }
  | { type: "precedents"; data: Precedents }
  | { type: "risks"; data: Risks }
  | { type: "plan"; data: Plan }
  | { type: "done" };

export const STEPS = ["sources", "legal", "community", "precedents", "risks", "plan"] as const;
export type StepId = (typeof STEPS)[number];
export const STEP_LABELS: Record<StepId, string> = {
  sources: "Pulling news & social",
  legal: "Legal framework",
  community: "Sentiment & themes",
  precedents: "Precedent decisions",
  risks: "Quantifying risk",
  plan: "Mitigation plan",
};

export const riskScore = (likelihood: number, impact: number) => Math.round(likelihood * impact * 4);

/** Headline score leans towards the worst risk so one critical issue is never averaged away. */
export const overallScore = (scores: number[]) =>
  scores.length ? Math.round(0.5 * Math.max(...scores) + 0.5 * (scores.reduce((a, b) => a + b, 0) / scores.length)) : 0;
