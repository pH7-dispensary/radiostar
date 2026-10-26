// Owned evaluation fixtures. Statements and positions below are synthetic,
// not attributed to real podcasts. Expected answers are source IDs, not invented prose.
import { fixtureTranscript } from "../intelligence.mjs";
export const corpus = [
  { ...fixtureTranscript, id: "owned-en", episodeId: "owned-en" },
  {
    id: "owned-pt",
    episodeId: "owned-pt",
    transcriptVersion: "owned-v1",
    language: "pt-PT",
    segments: [
      {
        id: "pt1",
        text: "A investigação sobre inteligência artificial exige supervisão humana e transparência nas decisões.",
        startMs: 10000,
        endMs: 25000,
        speaker: "Investigadora",
      },
      {
        id: "pt2",
        text: "A equipa recomenda o livro sobre energia renovável. O orçamento é de 25 euros por mês.",
        startMs: 25000,
        endMs: 40000,
      },
      {
        id: "pt3",
        text: "A segurança não deve depender apenas de promessas comerciais.",
        startMs: 40000,
        endMs: 50000,
      },
    ],
  },
  {
    id: "owned-zh",
    episodeId: "owned-zh",
    transcriptVersion: "owned-v1",
    language: "zh",
    segments: [
      {
        id: "zh1",
        text: "人工智能安全研究需要人类监督，不能只依赖公司的承诺。",
        startMs: 30000,
        endMs: 45000,
      },
      {
        id: "zh2",
        text: "研究人员讨论了可再生能源和计算资源的需求。",
        startMs: 45000,
        endMs: 60000,
      },
      {
        id: "zh3",
        text: "园艺课程介绍如何种植番茄，没有讨论医学治疗。",
        startMs: 60000,
        endMs: 70000,
      },
    ],
  },
  {
    id: "owned-debate",
    episodeId: "owned-debate",
    transcriptVersion: "owned-v1",
    language: "en",
    segments: [
      {
        id: "d1",
        text: "Ada supports the regulation proposal because independent audits can reveal hidden risks.",
        speaker: "Ada",
        startMs: 0,
        endMs: 20000,
      },
      {
        id: "d2",
        text: "Bruno opposes the regulation proposal because compliance costs could exclude small teams.",
        speaker: "Bruno",
        startMs: 20000,
        endMs: 40000,
      },
      {
        id: "d3",
        text: "The proposal might reduce accidents. We do not yet have trial results.",
        startMs: 40000,
        endMs: 60000,
      },
      {
        id: "d4",
        text: "The gardening class planted twenty tomato seedlings in May. No medical treatment was discussed.",
        startMs: 60000,
        endMs: 80000,
      },
    ],
  },
  {
    id: "owned-partial",
    episodeId: "owned-partial",
    transcriptVersion: "owned-v1",
    language: "en",
    quality: { readiness: "PARTIAL", complete: false },
    segments: [
      {
        id: "p1",
        text: "This available opening section discusses electricity demand from data centres.",
        startMs: 0,
        endMs: 20000,
      },
    ],
  },
  {
    id: "owned-long",
    episodeId: "owned-long",
    transcriptVersion: "owned-v1",
    language: "en",
    segments: [
      {
        id: "l1",
        text: "The opening presentation examines software deployment controls.",
        startMs: 0,
        endMs: 30000,
      },
      {
        id: "l2",
        text: "Near the end, a minority viewpoint favours reversible deployment instead of permanent administrative power.",
        startMs: 9000000,
        endMs: 9030000,
      },
    ],
  },
];
export const queries = [
  ["exact", "strategic deception", ["owned-en:s4"]],
  [
    "paraphrase",
    "How can we undo what an automated system did?",
    ["owned-en:s4", "owned-long:l2"],
  ],
  [
    "paraphrase",
    "Machines misleading their supervisors",
    ["owned-en:s4", "owned-en:s3"],
  ],
  ["topic", "energy and compute", ["owned-en:s6"]],
  [
    "opinions",
    "Compare arguments for and against the regulation proposal",
    ["owned-debate:d1", "owned-debate:d2"],
  ],
  ["speaker", "What does Bruno say about regulation?", ["owned-debate:d2"]],
  [
    "comparison",
    "Compare views on oversight and regulation",
    ["owned-en:s2", "owned-en:s6", "owned-debate:d1", "owned-debate:d2"],
  ],
  ["absent", "Which medicine cures pancreatic cancer?", []],
  [
    "uncertain",
    "Did trials prove the proposal reduces accidents?",
    ["owned-debate:d3"],
  ],
  ["zh", "人工智能安全", ["owned-zh:zh1"]],
  ["zh", "智能安全研究", ["owned-zh:zh1"]],
  ["zh", "人类监督", ["owned-zh:zh1"]],
  ["zh", "可再生能源", ["owned-zh:zh2"]],
  ["pt", "inteligência artificial", ["owned-pt:pt1"]],
  ["pt", "inteligencia artificial", ["owned-pt:pt1"]],
  ["pt", "transparência nas decisões", ["owned-pt:pt1"]],
  ["recommendation", "Que livro recomenda a equipa?", ["owned-pt:pt2"]],
  ["long", "reversible deployment", ["owned-long:l2"]],
  ["partial", "electricity demand data centres", ["owned-partial:p1"]],
  ["absent", "Who won the lunar chess championship?", []],
  ["exact", "twenty tomato seedlings", ["owned-debate:d4"]],
  [
    "uncertain",
    "Who said we do not yet have trial results?",
    ["owned-debate:d3"],
  ],
  [
    "paraphrase",
    "Why could smaller organisations struggle to comply?",
    ["owned-debate:d2"],
  ],
  [
    "paraphrase",
    "A machine hiding how it achieved its objective",
    ["owned-en:s4"],
  ],
].map(([category, query, relevant], i) => ({
  id: `q${i + 1}`,
  category,
  query,
  relevant,
}));
export const provenance = {
  kind: "owned_synthetic",
  humanReviewed: false,
  limitations:
    "Engineering-labelled source references; authored multilingual fixtures test language handling. Not representative human-labelled real-world semantic quality.",
};
