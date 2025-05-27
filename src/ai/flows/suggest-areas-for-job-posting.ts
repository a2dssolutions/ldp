
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

// Removed ai.definePrompt for deterministic mock suggestions during testing.
// const prompt = ai.definePrompt({
//   name: 'suggestAreasForJobPostingPrompt',
//   input: {schema: SuggestAreasForJobPostingInputSchema},
//   output: {schema: SuggestAreasForJobPostingOutputSchema},
//   prompt: `You are an expert in job market analysis for India. Given the client and city, you will suggest the top 5 areas to post jobs in.
// Consider factors like population density, business activity, and existing demand for the specified client in that city.

// Client: {{{client}}}
// City: {{{city}}}

// Suggest the top 5 areas to post jobs in for an Indian context:
// `,
// });

const suggestAreasForJobPostingFlow = ai.defineFlow(
  {
    name: 'suggestAreasForJobPostingFlow',
    inputSchema: SuggestAreasForJobPostingInputSchema,
    outputSchema: SuggestAreasForJobPostingOutputSchema,
  },
  async (input: SuggestAreasForJobPostingInput): Promise<SuggestAreasForJobPostingOutput> => {
    console.log(`Generating mock suggestions for city: ${input.city}, client: ${input.client}`);
    let suggestedAreas: string[] = [];

    switch (input.city.toLowerCase()) {
      case 'delhi':
        suggestedAreas = ['Connaught Place', 'Saket', 'Lajpat Nagar', 'Karol Bagh', 'Dwarka'];
        break;
      case 'mumbai':
        suggestedAreas = ['Bandra', 'Andheri', 'Dadar', 'Juhu', 'Colaba'];
        break;
      case 'bangalore':
        suggestedAreas = ['Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Electronic City'];
        break;
      case 'chennai':
        suggestedAreas = ['T. Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'OMR'];
        break;
      case 'kolkata':
        suggestedAreas = ['Park Street', 'Salt Lake', 'New Town', 'Ballygunge', 'Howrah'];
        break;
      case 'hyderabad':
        suggestedAreas = ['Banjara Hills', 'Jubilee Hills', 'Gachibowli', 'Madhapur', 'Kukatpally'];
        break;
      case 'pune':
        suggestedAreas = ['Koregaon Park', 'Viman Nagar', 'Hinjewadi', 'Kothrud', 'Baner'];
        break;
      default:
        suggestedAreas = [
          `Generic Area 1 for ${input.city}`,
          `Generic Area 2 for ${input.city}`,
          `Generic Area 3 for ${input.city}`,
          `Generic Area 4 for ${input.city}`,
          `Generic Area 5 for ${input.city}`,
        ];
        break;
    }
    
    // If a specific client is 'Zepto', add a Zepto-specific suggestion if not already full
    if (input.client.toLowerCase() === 'zepto' && suggestedAreas.length < 5) {
        suggestedAreas.push(`Zepto Hub in ${input.city}`);
    } else if (input.client.toLowerCase() === 'blinkit'  && suggestedAreas.length < 5) {
        suggestedAreas.push(`Blinkit Darkstore Area ${input.city}`);
    }


    return {
      areas: suggestedAreas.slice(0, 5), // Ensure only 5 areas are returned
    };
  }
);
