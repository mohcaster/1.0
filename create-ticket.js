// netlify/functions/create-ticket.js
import { supabase, createErrorResponse, createSuccessResponse } from './_common/supabaseClient.js';

export default async (req) => {
  if (req.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const ticketData = await req.json();

    // More robust validation
    if (!ticketData.material_type || !ticketData.location || !ticketData.email || !ticketData.priority || !ticketData.category || !ticketData.team || !ticketData.description) {
       return createErrorResponse('Missing required ticket fields', 400);
    }
     if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ticketData.email)) {
        return createErrorResponse('Invalid email format', 400);
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert([
        {
          material_type: ticketData.material_type,
          location: ticketData.location,
          category: ticketData.category,
          email: ticketData.email,
          priority: ticketData.priority,
          team: ticketData.team,
          description: ticketData.description,
          // status and assigned_to have defaults in the database
        },
      ])
      .select()
      .single();

    if (error) {
      return createErrorResponse('Database insert error', 500, error);
    }

    return createSuccessResponse({ message: 'Ticket created successfully', ticket: data }, 201);

  } catch (err) {
    if (err instanceof SyntaxError) {
         return createErrorResponse('Invalid JSON body', 400);
    }
    return createErrorResponse('Internal Server Error', 500, err);
  }
};

export const config = { path: "/api/create-ticket" };