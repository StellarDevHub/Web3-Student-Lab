import { jest } from '@jest/globals';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

describe('GeneratorService - custom RPC integration', () => {
  beforeEach(() => {
    mockCreate.mockClear();
  });

  it('passes customRpcUrl into the AI prompt when provided', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'RPC Test Project',
              description: 'Test description',
              keyFeatures: ['f1'],
              recommendedTech: ['Node.js'],
              difficulty: 'Intermediate',
            }),
          },
        },
      ],
    };

    mockCreate.mockResolvedValue(mockResponse as never);

    // Dynamic import to ensure mock is applied
    const mod = await import('../src/generator/generator.service.js');
    const GeneratorService = mod.GeneratorService;
    const svc = new GeneratorService();

    const customRpc = 'https://custom-rpc.example:443';
    const result = await svc.generateProjectIdea('Theme', ['React'], 'Intermediate', customRpc);

    expect(mockCreate).toHaveBeenCalled();
    const calledArg = mockCreate.mock.calls[0][0];
    const userMessage = calledArg.messages[1].content;
    expect(userMessage).toContain(customRpc);
    expect(result).toHaveProperty('title', 'RPC Test Project');
  });
});
