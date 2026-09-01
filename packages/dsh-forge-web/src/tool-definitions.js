/**
 * Tool definitions: describes configurable fields for each tool in each agent.
 * The frontend uses this to render the settings UI.
 */

export const TOOL_DEFINITIONS = {
  research: {
    pmaxis: {
      label: 'PMAxis API',
      description: 'Prediction market data API',
      fields: [
        {
          id: 'apiKey',
          label: 'API Key',
          type: 'secret',
          envKey: 'PMAXIS_API_KEY_RESEARCH',
          fallbackEnvKey: 'PMAXIS_API_KEY',
          placeholder: 'sk-...',
        },
        {
          id: 'baseUrl',
          label: 'API Base URL',
          type: 'text',
          default: 'https://api.pmaxis.trade',
          placeholder: 'https://api.pmaxis.trade',
        },
      ],
    },
  },
  'copy-trading': {
    pmaxis: {
      label: 'PMAxis API',
      description: 'Prediction market data API',
      fields: [
        {
          id: 'apiKey',
          label: 'API Key',
          type: 'secret',
          envKey: 'PMAXIS_API_KEY_COPY_TRADING',
          fallbackEnvKey: 'PMAXIS_API_KEY',
          placeholder: 'sk-...',
        },
        {
          id: 'baseUrl',
          label: 'API Base URL',
          type: 'text',
          default: 'https://api.pmaxis.trade',
          placeholder: 'https://api.pmaxis.trade',
        },
      ],
    },
  },
  signals: {
    pmaxis: {
      label: 'PMAxis API',
      description: 'Prediction market data API',
      fields: [
        {
          id: 'apiKey',
          label: 'API Key',
          type: 'secret',
          envKey: 'PMAXIS_API_KEY_SIGNALS',
          fallbackEnvKey: 'PMAXIS_API_KEY',
          placeholder: 'sk-...',
        },
        {
          id: 'baseUrl',
          label: 'API Base URL',
          type: 'text',
          default: 'https://api.pmaxis.trade',
          placeholder: 'https://api.pmaxis.trade',
        },
      ],
    },
  },
}

export const TOOL_DEFINITIONS_GLOBAL = {
  pmaxis: {
    label: 'PMAxis API (Global)',
    description: 'Fallback API key for all agents',
    fields: [
      {
        id: 'apiKey',
        label: 'API Key',
        type: 'secret',
        envKey: 'PMAXIS_API_KEY',
        placeholder: 'sk-...',
      },
    ],
  },
}
