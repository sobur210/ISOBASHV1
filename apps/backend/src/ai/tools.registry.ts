import { Injectable } from '@nestjs/common';

export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

@Injectable()
export class AiToolsRegistry {
  private readonly tools = new Map<string, AiToolDefinition>();

  register(definition: AiToolDefinition) {
    this.tools.set(definition.name, definition);
  }

  list(): AiToolDefinition[] {
    return [...this.tools.values()];
  }
}