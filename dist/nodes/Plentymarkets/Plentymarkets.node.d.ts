import { IExecuteFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';
export declare class Plentymarkets implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<import("n8n-workflow").INodeExecutionData[][]>;
}
