
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
  areas: z.array(z.string()).describe('The top 5 areas to post jobs in, ideally with demand scores greater than 10.'),
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
Prioritize areas where current demand is likely high, ideally with a demand score greater than 10 if such data were available to you.
Consider factors like population density, business activity, local economic indicators, and existing demand patterns for the specified client in that city.

Client: {{{client}}}
City: {{{city}}}

Suggest the top 5 areas to post jobs in for an Indian context, focusing on areas with potentially high demand (e.g., demand score > 10):
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
    // In a future iteration, this flow could use a Genkit Tool to fetch live demand data from Firestore
    // and pass it to the prompt or use it to filter/rank suggestions.
    // For now, the prompt guides the LLM to consider high demand conceptually.
    const {output} = await prompt(input);
    if (!output || !output.areas || output.areas.length === 0) {
        console.error('AI prompt did not return an output or areas for suggestAreasForJobPostingFlow');
        // Provide a fallback or more specific error message
        return { areas: ['AI suggestion generation failed. Please check logs or try different criteria.'] };
    }
    return output;
  }
);

