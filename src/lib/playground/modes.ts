import modesData from '@/data/playground/modes.json';

export interface PlaygroundMode {
    id: string;
    name: string;
    icon: string;
    description: string;
    systemPrompt: string;
}

export type PlaygroundModeId =
    | 'debate'
    | 'code'
    | 'build'
    | 'ask'
    | 'debug'
    | 'architect'
    | 'orchestrator'
    | 'merge-resolver'
    | 'skill-writer'
    | 'documentation-writer'
    | 'project-research'
    | 'security-reviewer'
    | 'google-genai-developer'
    | 'jest-test-engineer'
    | 'tool-writer'
    | 'devops';

export const PLAYGROUND_MODES: PlaygroundMode[] = modesData as PlaygroundMode[];

export function getModeById(id?: string): PlaygroundMode | undefined {
    if (!id) return undefined;
    return PLAYGROUND_MODES.find((m) => m.id === id);
}
