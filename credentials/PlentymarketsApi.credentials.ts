import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
	IHttpRequestHelper,
	IDataObject,
	Icon,
	ICredentialTestRequest,
} from 'n8n-workflow';

export class PlentymarketsApi implements ICredentialType {
	name = 'plentymarketsApi';
	displayName = 'PlentyONE API';
	documentationUrl = 'https://developers.plentymarkets.com/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://your.plentymarkets-cloud.de',
			required: true,
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'hidden',
			typeOptions: {
				expirable: true,
				password: true,
			},
			default: '',
		},
		{
			displayName: 'Access Token Expires At',
			name: 'expiresAt',
			type: 'hidden',
			default: 0,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			baseURL: '={{$credentials.baseUrl.replace(new RegExp("/+$"), "")}}',
			url: '/rest/login',
			body: {
				username: '={{$credentials.username}}',
				password: '={{$credentials.password}}',
			},
			json: true,
		},
	};

	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: IDataObject,
	): Promise<IDataObject> {
		const accessToken = credentials.accessToken as string | undefined;
		const expiresAtRaw = credentials.expiresAt as number | string | undefined;
		const expiresAt =
			typeof expiresAtRaw === 'number'
				? expiresAtRaw
				: expiresAtRaw
				? Number(expiresAtRaw)
				: 0;
		const now = Date.now();
		const refreshBuffer = 60 * 1000;

		if (accessToken && expiresAt && expiresAt - refreshBuffer > now) {
			return {};
		}

		const baseUrl = ((credentials.baseUrl as string) || '').replace(/\/+$/, '');

		const response = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/rest/login`,
			body: {
				username: credentials.username,
				password: credentials.password,
			},
			headers: {
				'Content-Type': 'application/json',
			},
			json: true,
		})) as IDataObject;

		const expiresIn = Number(response.expiresIn ?? 0);
		const calculatedExpiresAt =
			expiresIn > 0 ? now + Math.max(0, expiresIn - 60) * 1000 : now;

		return {
			accessToken: response.accessToken,
			expiresAt: calculatedExpiresAt,
		};
	}
}
