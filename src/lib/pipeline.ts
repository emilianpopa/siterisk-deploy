import { generate } from "./llm";
import { gatherSources } from "./search";
import {
  CommunitySchema,
  LegalSchema,
  PlanSchema,
  PrecedentSchema,
  RISK_CATEGORIES,
  RISK_LABELS,
  RiskSchema,
  overallScore,
  riskScore,
  type AssessEvent,
  type Community,
  type CompanyProfile,
  type Legal,
  type Place,
  type Plan,
  type Precedents,
  type Risks,
  type Source,
  type StepId,
} from "./types";

const SYSTEM = `You are a senior UK planning, infrastructure and ESG risk analyst advising the Chief Risk Officer of a company that wants to build new data centre capacity in the UK.
Be specific to the exact location, nation (England, Scotland, Wales and Northern Ireland have different planning regimes) and project.
Ground every claim in the numbered sources provided where possible and cite them by their exact id (e.g. "S4"). Never cite an id that is not in the list.
If the sources do not cover something, rely on well-established UK law and policy, but do not invent specific facts, dates or decisions.
Write in plain, decisive British English for an executive audience.

The team's central question is how PUBLIC SENTIMENT affects the ability to build a data centre and how it changes each risk. Pay close attention to grassroots mobilisation — packed public meetings, campaign groups forming, sign-up and petition numbers, fighting funds, protests, formal objections, councillors/MPs taking sides, protected designations campaigners invoke (Green Belt, National Landscapes/AONB, UNESCO Biosphere, SSSI) — and to how developers respond (community benefit packages, consultation). Treat these as leading indicators: they typically appear before a planning application and predict committee refusal, call-in, judicial review, delay and reputational cost.`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

function describeContext(profile: CompanyProfile, place: Place) {
  return `TODAY: ${new Date().toISOString().slice(0, 10)} (all timelines must start from today)

COMPANY
- Name: ${profile.companyName || "(unnamed)"}
- Industry: ${profile.industry}
- Headquarters: ${profile.headquarters || "(not given)"}
- Project: new data centre capacity in the UK (size and design not yet fixed; assume a typical facility for this industry)

PROPOSED LOCATION
- ${place.label}
- Coordinates: ${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}
- Local planning authority (best guess from geocoder): ${place.localAuthority}
- Nation: ${place.nation}`;
}

function describeSources(sources: Source[]) {
  if (!sources.length) return "(no sources)";
  return sources
    .map((s) => `[${s.id}] (${s.kind}, ${s.platform}${s.date ? `, ${s.date}` : ""}) ${s.title}\n${s.snippet}`)
    .join("\n\n");
}

/** Source ids belong in citation chips, not in prose. */
const stripCitations = (text: string) => text.replace(/\s*[\[(]S\d+(?:\s*[,;]\s*S\d+)*[\])]/g, "").replace(/\s+([.,;])/g, "$1");

function keepIds(ids: string[], valid: Set<string>) {
  return [...new Set(ids.map((i) => i.trim().toUpperCase()))].filter((i) => valid.has(i));
}

async function legalStep(ctx: string, sources: Source[], valid: Set<string>): Promise<Legal> {
  const out = await generate(
    LegalSchema,
    SYSTEM,
    `${ctx}

TASK
Identify the legal framework and consents this data centre would need at this location, in the order a developer meets them.
Cover at least: the consenting route (local planning application vs Development Consent Order under the Planning Act 2008 if the project could be directed into the NSIP regime), national planning policy for this nation, the local plan and any Green Belt/"grey belt" or landscape designations, Environmental Impact Assessment, biodiversity net gain, environmental permits for backup generation (Medium Combustion Plant / Specified Generator rules), noise, water abstraction and discharge / water company capacity, grid connection (NESO / DNO connection queue), building regulations, and any data-centre-specific government policy (e.g. Critical National Infrastructure designation, AI Growth Zones).
Mark each requirement as mandatory, likely or conditional for THIS project. Give 8-14 requirements and up to 5 local policies.
For each requirement also assess compliance today: the project is at the site-selection stage, so consents and permits not yet obtained are non-compliant, site characteristics that conflict with policy (e.g. Green Belt, protected landscape, flood zone, grid or water constraints) are non-compliant, anything the site already satisfies is compliant, and anything that depends on unknown design details is uncertain. Explain each in one sentence with what would make it compliant.

SOURCES
${describeSources(sources)}`,
  );
  return {
    ...out,
    requirements: out.requirements.map((r, i) => ({ ...r, id: `R${i + 1}`, sourceIds: keepIds(r.sourceIds, valid) })),
    localPolicies: out.localPolicies.map((p) => ({ ...p, sourceIds: keepIds(p.sourceIds, valid) })),
  };
}

async function communityStep(ctx: string, sources: Source[], valid: Set<string>): Promise<Community> {
  const out = await generate(
    CommunitySchema,
    SYSTEM,
    `${ctx}

TASK
Assess public sentiment towards building a data centre at or near this location and how it would affect the project, using the news articles and social media posts below.
1. For EVERY source that says something about data centres give its sentiment towards data centre development, a one-line stance, and its scope: local (this site/town/district), regional (same county/region) or national (elsewhere in the UK — an analogue of what could happen here). Skip irrelevant sources (e.g. stories that only share a place name).
2. Pick up to 6 of the most telling quotes or close paraphrases and who said them, preferring local residents, campaigners and elected representatives.
3. Assess MOBILISATION near this site: its level, the groups involved (with concrete scale — attendance, sign-ups, signatures, objections, money raised), each concrete signal (public meeting, petition, protest, campaign fund, legal challenge, political opposition, formal objections, media campaign, community benefit offer, local support), and the designations campaigners cite. If there is no local activity, say so, and note analogous campaigns elsewhere that show what could emerge.
4. Explain RISK TRANSMISSION: 3-6 specific mechanisms by which this sentiment raises (or lowers) particular risk categories, each with magnitude and evidence.
5. Cluster the sources into 4-8 common themes (e.g. landscape and protected areas, water use, noise, generator emissions, grid strain, jobs and economy, Big Tech distrust, local democracy vs central government). Assign every relevant source to each theme it discusses and link each theme to the risk category it most affects.
Consider how the company's industry and headquarters are likely to be perceived locally (e.g. a foreign Big Tech operator).

SOURCES
${describeSources(sources)}`,
  );
  const sourceSentiments = out.sourceSentiments
    .map((s) => ({ ...s, sourceId: s.sourceId.trim().toUpperCase() }))
    .filter((s) => valid.has(s.sourceId));
  // Net sentiment should describe this place; national analogues only count when local coverage is thin.
  const near = sourceSentiments.filter((s) => s.scope !== "national");
  const basis = near.length >= 3 ? near : sourceSentiments;
  const count = (k: string) => basis.filter((s) => s.sentiment === k).length;
  const total = basis.length || 1;
  const mix = { positive: count("positive") / total, neutral: count("neutral") / total, negative: count("negative") / total };
  return {
    ...out,
    sourceSentiments,
    mobilisation: {
      ...out.mobilisation,
      groups: out.mobilisation.groups.map((g) => ({ ...g, sourceIds: keepIds(g.sourceIds, valid) })),
      signals: out.mobilisation.signals.map((x) => ({ ...x, sourceIds: keepIds(x.sourceIds, valid) })),
    },
    riskTransmission: out.riskTransmission.map((r) => ({ ...r, sourceIds: keepIds(r.sourceIds, valid) })),
    basis: basis === near ? "local" : "all",
    keyVoices: out.keyVoices.map((v) => ({ ...v, sourceId: v.sourceId.trim().toUpperCase() })).filter((v) => valid.has(v.sourceId)),
    themes: out.themes
      .map((t, i) => ({ ...t, id: `T${i + 1}`, sourceIds: keepIds(t.sourceIds, valid) }))
      .sort((a, b) => b.sourceIds.length - a.sourceIds.length),
    mix,
    score: Math.round((mix.positive - mix.negative) * 100),
  };
}

async function precedentStep(ctx: string, sources: Source[], valid: Set<string>): Promise<Precedents> {
  const out = await generate(
    PrecedentSchema,
    SYSTEM,
    `${ctx}

TASK
Find data centre planning decisions that are precedents for this proposal, prioritising those nearest to the location and in the same nation. From the sources, list 3-8 schemes that passed or failed (or are pending/called-in/quashed), why, and who decided.
For each, give 1-3 pieces of ADVICE to this company for its own proposal, written as an adviser speaking to the client ("Commission…", "Engage…", "Avoid…", "Secure… before…"): specific, actionable steps with the reason drawn from that precedent — not general observations.
Give approximate coordinates (lat/lng) for each scheme's location. Only include schemes that appear in the sources.

SOURCES
${describeSources(sources)}`,
  );
  return {
    ...out,
    precedents: out.precedents.map((p) => ({ ...p, sourceIds: keepIds(p.sourceIds, valid) })),
  };
}

async function riskStep(
  ctx: string,
  legal: Legal | null,
  community: Community | null,
  precedents: Precedents | null,
  sources: Source[],
  valid: Set<string>,
): Promise<Risks> {
  const out = await generate(
    RiskSchema,
    SYSTEM,
    `${ctx}

TASK
Quantify the risk of building this data centre here. Score EACH of these categories on likelihood (1-5, how likely the risk materialises and delays/blocks/costs the project) and impact (1-5, severity for the company if it does):
${RISK_CATEGORIES.map((c) => `- ${c}: ${RISK_LABELS[c]}`).join("\n")}
Explain why with concrete evidence and cite source ids. For every category, state in sentimentEffect how public sentiment and mobilisation change it — organised local opposition should materially raise planning, community and legal-challenge likelihood; supportive or indifferent communities lower them. Also estimate the probability (0-100) of obtaining consent at the first attempt.

LEGAL FRAMEWORK
${legal ? JSON.stringify({ regime: legal.regime, summary: legal.summary, requirements: legal.requirements.map((r) => `${r.id} ${r.title} (${r.status})`), localPolicies: legal.localPolicies }) : "unavailable"}

PUBLIC SENTIMENT
${community ? JSON.stringify({ score: community.score, label: community.label, summary: community.summary, mobilisation: community.mobilisation, riskTransmission: community.riskTransmission, themes: community.themes.map((t) => ({ title: t.title, sentiment: t.sentiment, sources: t.sourceIds.length, category: t.riskCategory })) }) : "unavailable"}

PRECEDENTS
${precedents ? JSON.stringify(precedents) : "unavailable"}

SOURCE TITLES
${sources.map((s) => `[${s.id}] ${s.title}`).join("\n")}`,
  );
  const byCategory = new Map(out.risks.map((r) => [r.category, r]));
  const risks = RISK_CATEGORIES.map((category) => {
    const r = byCategory.get(category) ?? {
      category,
      likelihood: 2,
      impact: 2,
      why: "Not assessed by the model; defaulted to low-moderate.",
      sentimentEffect: "Not assessed.",
      drivers: [],
      confidence: "low" as const,
      sourceIds: [],
    };
    const likelihood = clamp(r.likelihood, 1, 5);
    const impact = clamp(r.impact, 1, 5);
    return { ...r, category, likelihood, impact, score: riskScore(likelihood, impact), sourceIds: keepIds(r.sourceIds, valid) };
  }).sort((a, b) => b.score - a.score);
  return {
    ...out,
    approvalLikelihood: clamp(out.approvalLikelihood, 0, 100),
    risks,
    overall: overallScore(risks.map((r) => r.score)),
  };
}

async function planStep(ctx: string, legal: Legal | null, community: Community | null, risks: Risks): Promise<Plan> {
  const out = await generate(
    PlanSchema,
    SYSTEM,
    `${ctx}

TASK
Write the to-do list a Chief Risk Officer needs to de-risk building this data centre here. 10-16 actions ordered by priority, covering: satisfying each mandatory legal requirement (e.g. securing planning permission, EIA, permits, grid offer), mitigating each high-scoring risk, and — as a priority — responding to public sentiment: engaging named campaign groups and elected representatives early (before any application), a credible local community benefit package, commitments that answer the specific concerns and designations campaigners cite (e.g. landscape screening, closed-loop cooling, HVO/battery backup, acoustic design, heat re-use), sentiment monitoring, and preparing for objections or judicial review.
Assign every action a track. Include at least 3 "sentiment" actions (how to influence public opinion: early engagement with the named campaign groups and elected representatives, transparent communication about water/noise/landscape, independent studies, local ambassadors and allies, responding to misinformation) and at least 3 "social-initiative" actions (tangible, locally-felt benefits: a community benefit fund, local jobs and skills or apprenticeship programmes, STEM partnerships with local schools, heat re-use for homes/public buildings, community energy or grid upgrades, public open space or biodiversity projects). Make them specific to this community and its concerns, with a realistic owner and timeline.
Do not put source ids in action titles or descriptions.
For each action state which risk categories it mitigates and by how many likelihood points (1 or 2), and reference the legal requirement ids (R…) and theme ids (T…) it addresses.

RISKS (highest first)
${risks.risks.map((r) => `- ${r.category} score ${r.score}/100 (L${r.likelihood} x I${r.impact}): ${r.why}`).join("\n")}

LEGAL REQUIREMENTS
${legal ? legal.requirements.map((r) => `${r.id} [${r.status}, ${r.stage}] ${r.title} — ${r.instrument}`).join("\n") : "unavailable"}

MOBILISATION
${community ? `${community.mobilisation.level}: ${community.mobilisation.summary}\nGroups: ${community.mobilisation.groups.map((g) => `${g.name} (${g.stance}, ${g.scale})`).join("; ") || "none"}\nDesignations cited: ${community.mobilisation.designationsCited.join(", ") || "none"}` : "unavailable"}

COMMUNITY THEMES
${community ? community.themes.map((t) => `${t.id} [${t.sentiment}, ${t.sourceIds.length} sources] ${t.title}: ${t.description}`).join("\n") : "unavailable"}`,
  );
  const reqIds = new Set(legal?.requirements.map((r) => r.id) ?? []);
  const themeIds = new Set(community?.themes.map((t) => t.id) ?? []);
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return {
    actions: out.actions
      .map((a, i) => ({
        ...a,
        description: stripCitations(a.description),
        id: `A${i + 1}`,
        mitigates: a.mitigates
          .filter((m) => (RISK_CATEGORIES as readonly string[]).includes(m.category))
          .map((m) => ({ ...m, likelihoodReduction: clamp(m.likelihoodReduction, 1, 2) })),
        requirementIds: a.requirementIds.map((x) => x.trim().toUpperCase()).filter((x) => reqIds.has(x)),
        themeIds: a.themeIds.map((x) => x.trim().toUpperCase()).filter((x) => themeIds.has(x)),
      }))
      .sort((a, b) => rank[a.priority] - rank[b.priority]),
  };
}

export async function runAssessment(profile: CompanyProfile, place: Place, send: (e: AssessEvent) => void) {
  const step = async <T>(id: StepId, fn: () => Promise<T>): Promise<T | null> => {
    send({ type: "step", step: id, state: "running" });
    try {
      const value = await fn();
      send({ type: "step", step: id, state: "done" });
      return value;
    } catch (err) {
      console.error(`[assess:${id}]`, err);
      send({ type: "step", step: id, state: "error", message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  const ctx = describeContext(profile, place);
  const sources = await step("sources", () => gatherSources(profile, place));
  if (!sources) return;
  send({ type: "sources", data: sources });

  const valid = new Set(sources.map((s) => s.id));
  const pick = (...p: Source["purpose"][]) => sources.filter((s) => p.includes(s.purpose));

  const [legal, community, precedents] = await Promise.all([
    step("legal", () => legalStep(ctx, pick("legal", "reference", "precedent"), valid)).then((d) => (d && send({ type: "legal", data: d }), d)),
    step("community", () => communityStep(ctx, pick("community", "reference", "precedent"), valid)).then((d) => (d && send({ type: "community", data: d }), d)),
    step("precedents", () => precedentStep(ctx, pick("precedent", "reference", "community"), valid)).then((d) => (d && send({ type: "precedents", data: d }), d)),
  ]);

  const risks = await step("risks", () => riskStep(ctx, legal, community, precedents, sources, valid));
  if (!risks) return;
  send({ type: "risks", data: risks });

  const plan = await step("plan", () => planStep(ctx, legal, community, risks));
  if (plan) send({ type: "plan", data: plan });
}
