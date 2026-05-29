export type ExportFormat = 'markdown' | 'json' | 'bookclub' | 'bibtex' | 'apa' | 'mla' | 'chicago' | 'research' | 'annotated_bib' | 'study_guide';

export interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
  icon: string;
  category: 'basic' | 'discussion' | 'citation' | 'research';
}

export const FORMATS: FormatOption[] = [
  { value: 'markdown', label: 'export_format_markdown', description: 'export_format_markdown_desc', icon: 'M', category: 'basic' },
  { value: 'json', label: 'export_format_json', description: 'export_format_json_desc', icon: '{ }', category: 'basic' },
  { value: 'bookclub', label: 'export_format_bookclub', description: 'export_format_bookclub_desc', icon: '\u{1F4D6}', category: 'discussion' },
  { value: 'research', label: 'export_format_research', description: 'export_format_research_desc', icon: '\u{1F52C}', category: 'research' },
  { value: 'bibtex', label: 'export_format_bibtex', description: 'export_format_bibtex_desc', icon: 'B', category: 'citation' },
  { value: 'apa', label: 'export_format_apa', description: 'export_format_apa_desc', icon: 'A', category: 'citation' },
  { value: 'mla', label: 'export_format_mla', description: 'export_format_mla_desc', icon: 'M', category: 'citation' },
  { value: 'chicago', label: 'export_format_chicago', description: 'export_format_chicago_desc', icon: 'C', category: 'citation' },
  { value: 'annotated_bib', label: 'export_format_annotated_bib', description: 'export_format_annotated_bib_desc', icon: 'AB', category: 'citation' },
  { value: 'study_guide', label: 'export_format_study_guide', description: 'export_format_study_guide_desc', icon: 'SG', category: 'discussion' },
];

export const CATEGORIES = [
  { key: 'basic' as const, labelKey: 'export_category_basic' },
  { key: 'discussion' as const, labelKey: 'export_category_discussion' },
  { key: 'research' as const, labelKey: 'export_category_research' },
  { key: 'citation' as const, labelKey: 'export_category_citation' },
];

export const TYPE_OPTIONS = [
  { value: 'highlight', labelKey: 'sidebar_highlights', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
  { value: 'note', labelKey: 'sidebar_notes', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  { value: 'bookmark', labelKey: 'sidebar_bookmarks', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
];

export const CITATION_FORMATS = ['bibtex', 'apa', 'mla', 'chicago', 'annotated_bib'];
export const SHAREABLE_FORMATS = ['markdown', 'json', 'bookclub', 'research'];
