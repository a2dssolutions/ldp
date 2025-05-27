
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

Your response MUST be a JSON object with a key "areas". The value of "areas" MUST be an array of strings.
Each string in the "areas" array should be one of the top 5 suggested areas for job postings in an Indian context.
Focus on areas with potentially high demand (e.g., a conceptual demand score > 10).

Example JSON output format:
{
  "areas": ["Area 1 - High Demand", "Area 2 - Growing Fast", "Area 3 - Established Hub", "Area 4 - Good Connectivity", "Area 5 - New Business Park"]
}

Suggest the top 5 areas based on the client and city provided:
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
    
    try {
      const {output} = await prompt(input);
      
      if (!output || !output.areas || output.areas.length === 0) {
          console.error('AI prompt did not return a valid output or areas for suggestAreasForJobPostingFlow. Output:', output);
          // Provide a fallback or more specific error message that will be shown in the UI
          return { areas: ['AI suggestion generation failed. The model did not return valid areas. Please try different criteria or check logs.'] };
      }
      return output;

    } catch (flowError) {
        console.error('Error within suggestAreasForJobPostingFlow during prompt execution:', flowError);
        // This error will bubble up to the action if not handled here,
        // or we can return a structured error.
        // Returning a specific error structure helps the calling action differentiate.
        return { areas: [`AI service error. Details: ${flowError instanceof Error ? flowError.message : String(flowError)}`] };
    }
  }
);

