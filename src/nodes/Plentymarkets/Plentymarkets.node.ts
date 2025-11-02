import {
	IExecuteFunctions,
	INodeType,
	INodeTypeDescription,
	INodeProperties,
	NodeConnectionType,
	INodePropertyOptions,
	IHttpRequestOptions,
	IDataObject,
	IHttpRequestMethods,
} from 'n8n-workflow';

import * as fs from 'fs';
import * as path from 'path';

interface OperationDefinition {
	name: string;
	value: string;
	method?: string;
	endpoint?: string;
	description?: string;
	parameters?: INodeProperties[];
}

interface ResourceDefinition {
	resource: string;
	displayName: string;
	operations: OperationDefinition[];
}

const operationsDir = path.join(__dirname, 'operations');
const resourceFiles = fs.readdirSync(operationsDir).filter(f => f.endsWith('.json'));

const seenResources = new Set<string>();
const resourceDefinitions: ResourceDefinition[] = [];

for (const file of resourceFiles) {
	const content = fs.readFileSync(path.join(operationsDir, file), 'utf-8');
	const definition = JSON.parse(content);
	if (!seenResources.has(definition.resource)) {
		resourceDefinitions.push(definition);
		seenResources.add(definition.resource);
	}
}

const resourceOptions: INodePropertyOptions[] = resourceDefinitions.map((r) => ({
	name: r.displayName,
	value: r.resource,
}));

const allProperties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		options: resourceOptions,
		default: 'custom',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		options: [],
		default: '',
		displayOptions: {
			show: {
				resource: resourceDefinitions.map(r => r.resource),
			},
		},
	},
];

const operationOptions = new Set<string>();

resourceDefinitions.forEach((def) => {
	def.operations.forEach((op) => {
		const value = `${def.resource}.${op.value}`;
		if (!operationOptions.has(value)) {
			allProperties.find((p) => p.name === 'operation')!.options!.push({
				name: op.name,
				value,
				description: op.description ?? '',
			});
			operationOptions.add(value);
		}

		if (op.parameters) {
			op.parameters.forEach((param) => {
				allProperties.push({
					...param,
					displayOptions: {
						show: {
							resource: [def.resource],
							operation: [`${def.resource}.${op.value}`],
						},
					},
				});
			});
		}
	});
});

export class Plentymarkets implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PlentyONE',
		name: 'Plentymarkets',
		group: ['transform'],
		version: 1,
		description: 'Work with the PlentyONE (formerly plentymarkets) REST API',
		defaults: {
			name: 'PlentyONE',
		},
		inputs: ['main' as NodeConnectionType],
		outputs: ['main' as NodeConnectionType],
		icon: 'file:plentyone.svg',
		credentials: [
			{
				name: 'plentymarketsApi',
				required: true,
			},
		],
		properties: allProperties,
	};

	async execute(this: IExecuteFunctions) {
		const items = this.getInputData();
		const returnData = [];
		const credentials = await this.getCredentials('plentymarketsApi');
		const baseUrl = ((credentials.baseUrl as string) || '').replace(/\/+$/, '');
		const normalizeDataObject = (value: unknown): IDataObject => {
			if (value === null || value === undefined) {
				return {};
			}
			if (typeof value === 'object') {
				return value as IDataObject;
			}
			return {};
		};

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			let method = 'GET';
			let endpoint = '';
			let body: IDataObject = {};
			let queryParams: IDataObject = {};
			const operation = this.getNodeParameter('operation', i) as string;
		
			if (resource === 'custom') {
				const [, operationName] = operation.split('.');

				if (operationName === 'customRequest') {
					method = (this.getNodeParameter('method', i) as string).toUpperCase();
					endpoint = this.getNodeParameter('endpoint', i) as string;
					body = normalizeDataObject(this.getNodeParameter('bodyJson', i, {}));
				} else if (operationName === 'jsonDefinition') {
					const requestJson = this.getNodeParameter('requestJson', i, {}) as IDataObject | IDataObject[];
					const requests = Array.isArray(requestJson) ? requestJson : [requestJson];

					for (const requestDef of requests) {
						const reqMethod = ((requestDef.method as string) ?? 'GET').toUpperCase();
						const reqEndpoint = (requestDef.endpoint as string) ?? '';

						if (!reqEndpoint) {
							throw new Error('Endpoint is required in the request definition.');
						}

						const reqBody = normalizeDataObject(requestDef.body);
						const reqQuery = normalizeDataObject(requestDef.query);
						const reqHeaders = normalizeDataObject(requestDef.headers);

						const requestOptions: IHttpRequestOptions = {
							method: reqMethod as IHttpRequestMethods,
							baseURL: baseUrl,
							url: reqEndpoint,
							json: true,
						};

						if (reqHeaders && Object.keys(reqHeaders).length) {
							requestOptions.headers = {};
							for (const [key, value] of Object.entries(reqHeaders)) {
								if (value !== undefined && value !== null) {
									requestOptions.headers[key] = String(value);
								}
							}
						}

						if (reqQuery && Object.keys(reqQuery).length) {
							requestOptions.qs = reqQuery;
						}

						if (reqBody && Object.keys(reqBody).length) {
							if (['GET', 'HEAD'].includes(reqMethod)) {
								requestOptions.qs = {
									...(requestOptions.qs ?? {}),
									...reqBody,
								};
							} else {
								requestOptions.body = reqBody;
							}
						}

						const json = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'plentymarketsApi',
							requestOptions,
						);

						returnData.push({ json });
					}

					continue;
				} else {
					throw new Error(`Unsupported custom operation: ${operationName}`);
				}
			} else {
				const [resName, opName] = operation.split('.');
				const def = resourceDefinitions.find((r) => r.resource === resName);
				const op = def?.operations.find((o) => o.value === opName);
				if (!op) throw new Error(`Operation not found: ${operation}`);
				method = op.method ?? 'GET';
				endpoint = op.endpoint ?? '';
				body = {};
				queryParams = {};
		
				if (op.parameters) {
					for (const param of op.parameters) {
						const val = this.getNodeParameter(param.name, i);
						if (endpoint.includes(`{{${param.name}}}`)) {
							endpoint = endpoint.replace(`{{${param.name}}}`, encodeURIComponent(String(val)));
						} else {
							if (
								val !== undefined &&
								val !== null &&
								val !== '' &&
								!(Array.isArray(val) && val.length === 0) &&
								!(typeof val === 'number' && val === 0 && param.default === 0)
							) {
								queryParams[param.name] = val;
							}
						}
					}
				}
			}
		
			const requestOptions: IHttpRequestOptions = {
				method: method as IHttpRequestMethods,
				baseURL: baseUrl,
				url: endpoint,
				json: true,
			};
		
			if (Object.keys(queryParams).length) {
				requestOptions.qs = queryParams;
			}
		
			if (body && Object.keys(body).length > 0) {
				if (['GET', 'HEAD'].includes(method)) {
					requestOptions.qs = {
						...(requestOptions.qs ?? {}),
						...body,
					};
				} else {
					requestOptions.body = body;
				}
			}
		
			const json = await this.helpers.httpRequestWithAuthentication.call(
				this,
				'plentymarketsApi',
				requestOptions,
			);
			returnData.push({ json });
		}
		

		return this.prepareOutputData(returnData);
	}
}
