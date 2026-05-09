#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const interfacePath = resolve(repoRoot, "contracts/interface/splitnaira.contract-interface.json");

type ContractInterface = {
  methods: Array<{
    name: string;
    args: Array<{ name: string; type: string }>;
    returnType: string;
    mutability: string;
  }>;
  events: Array<{
    name: string;
    fields: Array<{ name: string; type: string; doc: string }>;
  }>;
  types: Record<string, {
    kind: "struct" | "enum";
    fields?: Array<{ name: string; type: string; doc: string }>;
    variants?: Array<{ name: string; fields: string[]; doc: string }>;
  }>;
  errors: Array<{ name: string; code: number; doc: string }>;
};

const contractInterface = JSON.parse(readFileSync(interfacePath, "utf8")) as ContractInterface;

// Type mapping from Soroban to TypeScript
function mapSorobanTypeToTS(type: string): string {
  const mappings: Record<string, string> = {
    "Address": "string",
    "String": "string",
    "Symbol": "string",
    "bool": "boolean",
    "u32": "number",
    "i128": "string", // BigInt as string for JSON serialization
    "u64": "string",
    "i64": "string",
  };

  // Handle Vec<T>
  if (type.startsWith("Vec<")) {
    const innerType = type.slice(4, -1);
    return `Array<${mapSorobanTypeToTS(innerType)}>`;
  }

  // Handle Option<T>
  if (type.startsWith("Option<")) {
    const innerType = type.slice(7, -1);
    return `${mapSorobanTypeToTS(innerType)} | null`;
  }

  // Handle Result<T, E>
  if (type.startsWith("Result<")) {
    const innerType = type.slice(7, -1).split(",")[0];
    return mapSorobanTypeToTS(innerType);
  }

  return mappings[type] || type;
}

// Generate TypeScript interface for a struct
function generateTSInterface(name: string, fields: Array<{ name: string; type: string; doc: string }>): string {
  const fieldLines = fields.map(field =>
    `  /** ${field.doc} */\n  ${field.name}: ${mapSorobanTypeToTS(field.type)};`
  ).join('\n');

  return `export interface ${name} {\n${fieldLines}\n}`;
}

// Generate Zod schema for a struct
function generateZodSchema(name: string, fields: Array<{ name: string; type: string; doc: string }>): string {
  const fieldLines = fields.map(field => {
    const tsType = mapSorobanTypeToTS(field.type);
    let zodType = "z.string()";

    if (tsType === "boolean") zodType = "z.boolean()";
    else if (tsType === "number") zodType = "z.number()";
    else if (tsType === "string") zodType = "z.string()";
    else if (tsType.startsWith("Array<")) {
      const innerType = tsType.slice(6, -1);
      let innerZod = "z.string()";
      if (innerType === "boolean") innerZod = "z.boolean()";
      else if (innerType === "number") innerZod = "z.number()";
      zodType = `z.array(${innerZod})`;
    } else if (tsType.includes(" | null")) {
      const baseType = tsType.replace(" | null", "");
      let baseZod = "z.string()";
      if (baseType === "boolean") baseZod = "z.boolean()";
      else if (baseType === "number") baseZod = "z.number()";
      zodType = `${baseZod}.nullable()`;
    }

    return `  ${field.name}: ${zodType}.describe("${field.doc}")`;
  }).join(',\n');

  return `export const ${name}Schema = z.object({\n${fieldLines}\n});`;
}

// Generate method argument types
function generateMethodArgs(name: string, args: Array<{ name: string; type: string }>): string {
  if (args.length === 0) return "";

  const argTypes = args.map(arg => `${arg.name}: ${mapSorobanTypeToTS(arg.type)}`).join(", ");
  return `export type ${capitalize(name)}Args = {\n${args.map(arg => `  ${arg.name}: ${mapSorobanTypeToTS(arg.type)};`).join('\n')}\n};`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Generate the complete types file
let output = `// Auto-generated from contract interface artifact
// Do not edit manually - regenerate with: npm run generate:contract-types

import { z } from "zod";

// Contract Types
`;

for (const [name, typeDef] of Object.entries(contractInterface.types)) {
  if (typeDef.kind === "struct" && typeDef.fields) {
    output += `\n${generateTSInterface(name, typeDef.fields)}\n\n`;
    output += `${generateZodSchema(name, typeDef.fields)}\n\n`;
  }
}

// Method argument types
output += "// Method Argument Types\n\n";
for (const method of contractInterface.methods) {
  if (method.args.length > 0) {
    output += `${generateMethodArgs(method.name, method.args)}\n\n`;
  }
}

// Event types
output += "// Event Types\n\n";
for (const event of contractInterface.events) {
  const fieldLines = event.fields.map(field =>
    `  ${field.name}: ${mapSorobanTypeToTS(field.type)};`
  ).join('\n');

  output += `export interface ${capitalize(event.name)}Event {\n${fieldLines}\n}\n\n`;
}

// Error types
output += "// Error Types\n\n";
output += "export const ContractErrors = {\n";
for (const error of contractInterface.errors) {
  output += `  ${error.name}: ${error.code},\n`;
}
output += "} as const;\n\n";

output += "export type ContractErrorCode = typeof ContractErrors[keyof typeof ContractErrors];\n";

// Write to backend
const backendOutputPath = resolve(repoRoot, "backend/src/generated/contract-types.ts");
writeFileSync(backendOutputPath, output);
console.log(`Generated backend types: ${backendOutputPath}`);

// Write simplified version to frontend (no Zod)
let frontendOutput = `// Auto-generated from contract interface artifact
// Do not edit manually - regenerate with: npm run generate:contract-types

// Contract Types
`;

for (const [name, typeDef] of Object.entries(contractInterface.types)) {
  if (typeDef.kind === "struct" && typeDef.fields) {
    frontendOutput += `\n${generateTSInterface(name, typeDef.fields)}\n\n`;
  }
}

// Method argument types
frontendOutput += "// Method Argument Types\n\n";
for (const method of contractInterface.methods) {
  if (method.args.length > 0) {
    frontendOutput += `${generateMethodArgs(method.name, method.args)}\n\n`;
  }
}

// Event types
frontendOutput += "// Event Types\n\n";
for (const event of contractInterface.events) {
  const fieldLines = event.fields.map(field =>
    `  ${field.name}: ${mapSorobanTypeToTS(field.type)};`
  ).join('\n');

  frontendOutput += `export interface ${capitalize(event.name)}Event {\n${fieldLines}\n}\n\n`;
}

// Error types
frontendOutput += "// Error Types\n\n";
frontendOutput += "export const ContractErrors = {\n";
for (const error of contractInterface.errors) {
  frontendOutput += `  ${error.name}: ${error.code},\n`;
}
frontendOutput += "} as const;\n\n";

frontendOutput += "export type ContractErrorCode = typeof ContractErrors[keyof typeof ContractErrors];\n";

const frontendOutputPath = resolve(repoRoot, "frontend/src/generated/contract-types.ts");
writeFileSync(frontendOutputPath, frontendOutput);
console.log(`Generated frontend types: ${frontendOutputPath}`);</content>
<parameter name="filePath">c:\Users\user\SplitNaira\scripts\generate-contract-types.mjs