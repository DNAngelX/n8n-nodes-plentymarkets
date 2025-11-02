# PlentyONE n8n Community Node

Interact with the PlentyONE (formerly plentymarkets) REST API directly from your n8n workflows.
This community node focuses on dynamic request handling so you can cover both well-known endpoints
and ad-hoc API calls without waiting for custom code changes.

## Highlights

- ✅ Automatic session handling via n8n `preAuthentication` – the access token is cached and refreshed only when needed.
- ✅ Classic *Custom Request* operation with support for sending payloads **even on GET/HEAD** calls (body → query parameters).
- ✅ New *Request via JSON Definition* operation to paste or inject complete request descriptions, e.g.:

  ```json
  {
    "method": "GET",
    "endpoint": "/rest/v2/properties/relations",
    "body": {
      "with": "values",
      "groupId": 44,
      "propertyId": 394,
      "type": "item",
      "targetId": 99211
    }
  }
  ```

  Arrays are supported as well – just provide a JSON array of request objects to execute them sequentially in one run.

- ✅ Local PlentyONE icon bundled with the node for easier identification inside n8n.

## Installation

Install the package inside your n8n instance (desktop, self-hosted or cloud with custom packages enabled):

```bash
npm install n8n-nodes-plentyone
```

Restart n8n afterwards so the node metadata is reloaded.

> **Compatibility:** The internal node type stays `n8n-nodes-plentymarkets.Plentymarkets`
> so existing workflows continue to work after upgrading from older releases.

## Credentials

Create a new credential record of type **PlentyONE API** and fill in:

| Field        | Description                                                                 |
|--------------|-----------------------------------------------------------------------------|
| Base URL     | Base URL of your PlentyONE environment (e.g. `https://example.plentyone.de`) |
| Username     | PlentyONE username used for API login                                       |
| Password     | Corresponding password                                                      |

The node stores the access token invisibly and refreshes it automatically before expiry.  
No external Redis/filesystem cache is required, so the credential works in hosted/cloud setups too.

## Operations

### Custom Request

Configure the HTTP method and endpoint in the node UI. The “Payload / Query (JSON)” parameter accepts a JSON object:

- For `GET`/`HEAD` requests the object is sent as query parameters.
- For all other methods the object is sent as JSON body.

### Request via JSON Definition

Provide a JSON object (or array of objects) with the following optional fields:

| Field    | Type            | Notes                                                                 |
|----------|-----------------|-----------------------------------------------------------------------|
| `method` | string          | Defaults to `GET`.                                                    |
| `endpoint` | string       | Required.                                                             |
| `body`   | object          | Used as JSON body (or merged into query for GET/HEAD).                |
| `query`  | object          | Explicit query string parameters.                                     |
| `headers` | object        | Custom headers added to the request.                                   |

Example payload for a PUT request:

```json
{
  "method": "PUT",
  "endpoint": "/rest/listings/markets/histories/update/",
  "body": {
    "id": [959893, 919078],
    "options": ["quantityAndPrice"]
  }
}
```

## Development

```bash
npm install
npm run build
```

`npm run build` compiles TypeScript and copies the PlentyONE icon plus operation schema into `dist/`.

## Licensing & Credits

- Icon: © PlentyONE — included locally as `plentyone.svg` according to the branding assets.
- Code: MIT License.

Pull requests and issue reports are welcome!
