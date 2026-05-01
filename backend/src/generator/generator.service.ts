import OpenAI from 'openai';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import { cbManager } from '../lib/circuit-breaker/CircuitBreakerManager.js';

dotenv.config();

export interface ProjectIdea {
  title: string;
  description: string;
  keyFeatures: string[];
  recommendedTech: string[];
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

export class GeneratorService {
  private openai: OpenAI | null = null;
  private breaker = cbManager.getOrCreateBreaker('openai-api', {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 60000, // 1 minute for AI
    windowMs: 30000,
  });

  constructor() {
    // Only initialize OpenAI if API key is provided
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
  }

  async generateProjectIdea(
    theme: string,
    techStack: string[],
    difficulty: string
  ): Promise<ProjectIdea> {
    return this.breaker.execute(
      async () => {
        const prompt = `
          As an expert Web3 and Software Architect, generate a unique and innovative hackathon project idea.
          
          Theme: ${theme}
          Technology Stack: ${techStack.join(', ')}
          Target Difficulty: ${difficulty}
          
          Return the response in a structured JSON format with the following keys:
          - title: A catchy name for the project.
          - description: A detailed description of the project and its value proposition.
          - keyFeatures: An array of 3-5 core functionalities.
          - recommendedTech: An array of tools and libraries that would be useful.
          - difficulty: The suggested level (Beginner, Intermediate, or Advanced).
          
          Ensure the idea is practical for a 48-hour hackathon but still innovative.
        `;

        if (!this.openai) {
          throw new Error('OpenAI API key not configured');
        }

        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant that generates innovative hackathon project ideas in JSON format.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content received from OpenAI');
        }

        return JSON.parse(content) as ProjectIdea;
      },
      (error) => {
        logger.error(`Circuit breaker fallback for generateProjectIdea triggered: ${error}`);
        // Fallback response
        return {
          title: 'Innovative Web3 DApp',
          description:
            'A decentralized application focused on solving local challenges using blockchain technology.',
          keyFeatures: ['Wallet Integration', 'On-chain Governance', 'Social Impact tracking'],
          recommendedTech: ['React', 'Stellar', 'Soroban'],
          difficulty: 'Intermediate' as any,
        };
      }
    );
  }
}

