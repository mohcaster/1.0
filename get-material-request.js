// netlify/functions/get-material-requests.js
import { supabase, createErrorResponse, createSuccessResponse } from './_common/supabaseClient.js';

export default async (req) => {
   if (req.method !== 'GET') {
       return createErrorResponse('Method Not Allowed', 405);
   }

   try {
       const { data, error } = await supabase
           .from('material_requests')
           .select('*')
           .order('created_at', { ascending: false }); // Order by creation date

       if (error) {
           return createErrorResponse('Database select error', 500, error);
       }

       return createSuccessResponse(data || []);

   } catch (err) {
       return createErrorResponse('Internal Server Error', 500, err);
   }
};

export const config = { path: "/api/get-material-requests" };