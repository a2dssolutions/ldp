
'use server';

/**
 * @fileOverview Suggests the top 5 areas to post jobs in based on current demand data.
 *
 * - suggestAreasForJobPosting - A function that suggests areas for job postings.
 * - SuggestAreasForJobPostingInput - The input type for the suggestAreasForJobPosting function.
 * - SuggestAreasForJobPostingOutput - The return type for the suggestAreasForJobPosting function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestAreasForJobPostingInputSchema = z.object({
  client: z.string().describe('The client for whom the job posting is being created.'),
  city: z.string().describe('The city in which the job posting will be located.'),
});
export type SuggestAreasForJobPostingInput = z.infer<typeof SuggestAreasForJobPostingInputSchema>;

const SuggestAreasForJobPostingOutputSchema = z.object({
  areas: z.array(z.string()).describe('The top 5 areas to post jobs in.'),
});
export type SuggestAreasForJobPostingOutput = z.infer<typeof SuggestAreasForJobPostingOutputSchema>;

export async function suggestAreasForJobPosting(
  input: SuggestAreasForJobPostingInput
): Promise<SuggestAreasForJobPostingOutput> {
  return suggestAreasForJobPostingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestAreasForJobPostingPrompt',
  input: {schema: SuggestAreasForJobPostingInputSchema},
  output: {schema: SuggestAreasForJobPostingOutputSchema},
  prompt: `You are an expert in job market analysis for India. Given the client and city, you will suggest the top 5 areas to post jobs in.
Consider factors like population density, business activity, and existing demand for the specified client in that city.

Client: {{{client}}}
City: {{{city}}}

Suggest the top 5 areas to post jobs in for an Indian context:
`,
});

const suggestAreasForJobPostingFlow = ai.defineFlow(
  {
    name: 'suggestAreasForJobPostingFlow',
    inputSchema: SuggestAreasForJobPostingInputSchema,
    outputSchema: SuggestAreasForJobPostingOutputSchema,
  },
  async (input: SuggestAreasForJobPostingInput): Promise<SuggestAreasForJobPostingOutput> => {
    console.log(`Generating AI suggestions for city: ${input.city}, client: ${input.client}`);
    const {output} = await prompt(input);
    if (!output) {
        // Handle cases where the prompt might not return an output as expected
        console.error('AI prompt did not return an output for suggestAreasForJobPostingFlow');
        return { areas: ['Error: Could not generate suggestions'] };
    }
    return output;
  }
);
