// netlify/functions/delete-ticket.js
import { supabase, createErrorResponse, createSuccessResponse } from './_common/supabaseClient.js';

export default async (req) => {
  if (req.method !== 'DELETE') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`); // Base URL needed for URLSearchParams
    const idParam = url.searchParams.get('id');
    const id = idParam ? parseInt(idParam, 10) : null;

    if (!id || isNaN(id)) {
      return createErrorResponse('Missing or invalid ticket ID query parameter', 400);
    }

    const { error, count } = await supabase
      .from('tickets')
      .delete({ count: 'exact' }) // Get the count of deleted rows
      .eq('id', id);

    if (error) {
      return createErrorResponse('Database delete error', 500, error);
    }

    if (count === 0) {
       return createErrorResponse('Ticket not found', 404);
    }

    return createSuccessResponse({ message: 'Ticket deleted successfully' });

  } catch (err) {
    return createErrorResponse('Internal Server Error', 500, err);
  }
};

 export const config = { path: "/api/delete-ticket" };