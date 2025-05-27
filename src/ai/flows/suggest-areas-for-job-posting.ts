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
  prompt: `You are an expert in job market analysis. Given the client and city, you will suggest the top 5 areas to post jobs in.

Client: {{{client}}}
City: {{{city}}}

Suggest the top 5 areas to post jobs in:
`,
});

const suggestAreasForJobPostingFlow = ai.defineFlow(
  {
    name: 'suggestAreasForJobPostingFlow',
    inputSchema: SuggestAreasForJobPostingInputSchema,
    outputSchema: SuggestAreasForJobPostingOutputSchema,
  },
  async input => {
    // Placeholder implementation: return some static suggestions.
    // In the future, this will use real demand data and potentially Gemini suggestions.
    const placeholderAreas = [
      'Area 1',
      'Area 2',
      'Area 3',
      'Area 4',
      'Area 5',
    ];

    // Call the prompt to get the suggestions
    const {output} = await prompt(input);

    // Return the placeholder areas as suggestions.
    return {
      areas: placeholderAreas,
    };
  }
);
