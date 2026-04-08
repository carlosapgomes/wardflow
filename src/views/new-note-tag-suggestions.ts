import { normalizeTagList, normalizeTagValue } from '@/models/tag';

export interface ApplyTagSuggestionResult {
  tags: string[];
  tagsInput: string;
}

export function getActiveTagQuery(tagsInput: string): string {
  const input = tagsInput;
  const lastCommaIndex = input.lastIndexOf(',');

  if (lastCommaIndex < 0) {
    return input.trim();
  }

  return input.slice(lastCommaIndex + 1).trim();
}

function getCompletedTagsBeforeActiveQuery(tagsInput: string): string[] {
  const input = tagsInput;
  const lastCommaIndex = input.lastIndexOf(',');

  if (lastCommaIndex < 0) {
    return [];
  }

  const completedPart = input.slice(0, lastCommaIndex);

  return normalizeTagList(
    completedPart
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
}

export function applyTagSuggestion(
  currentTags: string[],
  tagsInput: string,
  suggestedTag: string,
  maxTags: number
): ApplyTagSuggestionResult {
  const completedTags = getCompletedTagsBeforeActiveQuery(tagsInput);
  const merged = normalizeTagList([...currentTags, ...completedTags, suggestedTag], maxTags);

  return {
    tags: merged,
    tagsInput: '',
  };
}

export function filterSelectedSuggestions(suggestions: string[], selectedTags: string[]): string[] {
  const selectedCanonical = new Set(selectedTags.map((tag) => normalizeTagValue(tag)));

  return suggestions.filter((tag) => !selectedCanonical.has(normalizeTagValue(tag)));
}
