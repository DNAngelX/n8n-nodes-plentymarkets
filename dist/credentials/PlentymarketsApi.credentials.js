"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlentymarketsApi = void 0;
class PlentymarketsApi {
    constructor() {
        this.name = 'plentymarketsApi';
        this.displayName = 'PlentyONE API';
        this.documentationUrl = 'https://developers.plentymarkets.com/';
        this.properties = [
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
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: '=Bearer {{$credentials.accessToken}}',
                },
            },
        };
        this.test = {
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
    }
    async preAuthentication(credentials) {
        var _a;
        const accessToken = credentials.accessToken;
        const expiresAtRaw = credentials.expiresAt;
        const expiresAt = typeof expiresAtRaw === 'number'
            ? expiresAtRaw
            : expiresAtRaw
                ? Number(expiresAtRaw)
                : 0;
        const now = Date.now();
        const refreshBuffer = 60 * 1000;
        if (accessToken && expiresAt && expiresAt - refreshBuffer > now) {
            return {};
        }
        const baseUrl = (credentials.baseUrl || '').replace(/\/+$/, '');
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
        }));
        const expiresIn = Number((_a = response.expiresIn) !== null && _a !== void 0 ? _a : 0);
        const calculatedExpiresAt = expiresIn > 0 ? now + Math.max(0, expiresIn - 60) * 1000 : now;
        return {
            accessToken: response.accessToken,
            expiresAt: calculatedExpiresAt,
        };
    }
}
exports.PlentymarketsApi = PlentymarketsApi;
//# sourceMappingURL=PlentymarketsApi.credentials.js.map