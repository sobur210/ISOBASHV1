export declare class CreateMemoryDto {
    content: string;
    kind?: 'FACT' | 'PREFERENCE' | 'SUMMARY' | 'NOTE';
    agentId?: string;
}
