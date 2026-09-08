export interface Skill {
    id: string;
    name: string;
    description: string;
    prompt: string;
    permissions: {
        webSearch: boolean;
        runCommands: boolean;
    };
    isCustom?: boolean;
    isMarketplace?: boolean;
}
