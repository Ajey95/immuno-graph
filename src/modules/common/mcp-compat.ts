import type { z } from 'zod';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ExecutionContext {
  requestId: string;
  metadata?: Record<string, unknown>;
  logger: {
    info(event: string, details: Record<string, unknown>): void;
    warn(event: string, details: Record<string, unknown>): void;
    error(event: string, details: Record<string, unknown>): void;
  };
  task?: {
    throwIfCancelled(): void;
    updateProgress(message: string): void;
  };
}

export interface ToolOptions {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  examples?: unknown;
  metadata?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  taskSupport?: 'forbidden' | 'optional' | 'required';
}

export interface RegisteredHandler {
  method: string;
  options: ToolOptions;
}

const registrations = new WeakMap<object, RegisteredHandler[]>();

// Preserve existing handler declarations while the public runtime uses the official MCP SDK.
export function ControllerDecorator(): ClassDecorator {
  return () => undefined;
}

export function ToolDecorator(options: ToolOptions): MethodDecorator {
  return (prototype, method) => {
    const tools = registrations.get(prototype) ?? [];
    tools.push({ method: String(method), options });
    registrations.set(prototype, tools);
  };
}

export function registeredHandlers(controller: object): readonly RegisteredHandler[] {
  return registrations.get(Object.getPrototypeOf(controller)) ?? [];
}
