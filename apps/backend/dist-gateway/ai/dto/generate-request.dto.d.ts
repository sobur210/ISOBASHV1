import { AiCapability, AiMode } from '../../ai/provider.types';
export declare class GenerateRequestDto {
    capability: AiCapability;
    input: string;
    model?: string;
    mode?: AiMode;
}
