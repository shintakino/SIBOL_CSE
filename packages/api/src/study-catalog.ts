const both = ["professional", "subprofessional"] as const;
const professional = ["professional"] as const;
const subprofessional = ["subprofessional"] as const;
// Null mappings require an editor's item-specific assignment, not a guessed topic.
export const providerTopics = [
  {
    category: "general_information",
    subcategory: "general_information",
    levels: both,
    topicId: null,
  },
  {
    category: "numerical_ability",
    subcategory: "basic_operations",
    levels: both,
    topicId: "numerical-arithmetic",
  },
  {
    category: "numerical_ability",
    subcategory: "worded_problems",
    levels: both,
    topicId: "numerical-applied-word-problems",
  },
  {
    category: "numerical_ability",
    subcategory: "number_series",
    levels: both,
    topicId: "numerical-sequences",
  },
  {
    category: "verbal_ability",
    subcategory: "grammar_correct_usage",
    levels: both,
    topicId: "verbal-grammar",
  },
  {
    category: "verbal_ability",
    subcategory: "vocabulary",
    levels: both,
    topicId: "verbal-vocabulary",
  },
  {
    category: "verbal_ability",
    subcategory: "paragraph_organization",
    levels: both,
    topicId: "verbal-paragraph-ordering",
  },
  {
    category: "verbal_ability",
    subcategory: "reading_comprehension",
    levels: both,
    topicId: "verbal-comprehension",
  },
  {
    category: "verbal_ability",
    subcategory: "error_recognition",
    levels: both,
    topicId: "verbal-grammar",
  },
  {
    category: "analytical_ability",
    subcategory: "word_association",
    levels: professional,
    topicId: "analytical-analogies",
  },
  {
    category: "analytical_ability",
    subcategory: "identifying_assumptions_conclusion",
    levels: professional,
    topicId: "analytical-assumptions-and-conclusions",
  },
  {
    category: "analytical_ability",
    subcategory: "logic",
    levels: professional,
    topicId: "analytical-abstract-logic",
  },
  {
    category: "analytical_ability",
    subcategory: "data_interpretation",
    levels: professional,
    topicId: "analytical-interpreting-data",
  },
  {
    category: "analytical_ability",
    subcategory: "symbolic_logic_abstract_reasoning",
    levels: professional,
    topicId: "analytical-abstract-logic",
  },
  {
    category: "clerical_ability",
    subcategory: "filing_clerical_operations_alphabetizing",
    levels: subprofessional,
    topicId: "clerical-filing",
  },
  {
    category: "clerical_ability",
    subcategory: "spelling",
    levels: subprofessional,
    topicId: "clerical-spelling",
  },
] as const;

export const areaLabels = {
  verbal: "Verbal Ability",
  numerical: "Numerical Ability",
  analytical: "Analytical Ability",
  general: "General Information",
  clerical: "Clerical Ability",
} as const;
export type StudyArea = keyof typeof areaLabels;
export const providerArea = {
  verbal_ability: "verbal",
  numerical_ability: "numerical",
  analytical_ability: "analytical",
  general_information: "general",
  clerical_ability: "clerical",
} as const;
export const providerTopicLabels: Record<string, string> = {
  general_information: "General Information",
  basic_operations: "Basic Operations",
  worded_problems: "Worded Problems",
  number_series: "Number Series and Sequence",
  grammar_correct_usage: "Grammar and Correct Usage",
  vocabulary: "Vocabulary",
  paragraph_organization: "Paragraph Organization",
  reading_comprehension: "Reading Comprehension",
  error_recognition: "Error Recognition",
  word_association: "Word Analogy",
  identifying_assumptions_conclusion: "Assumptions and Conclusions",
  logic: "Logic",
  data_interpretation: "Data Interpretation",
  symbolic_logic_abstract_reasoning: "Symbolic Logic and Abstract Reasoning",
  filing_clerical_operations_alphabetizing: "Filing and Alphabetizing",
  spelling: "Spelling",
};
