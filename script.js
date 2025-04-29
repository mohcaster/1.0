
// Global state variables (will be populated by fetch)
let tickets = [];
let pedidos = [];
let currentCharts = {}; // To hold chart instances

// --- API Endpoint Helper ---
const API_BASE = '/api'; // Using Netlify redirect rule

// --- Utility Functions ---
function formatDuration(startDateStr, endDateStr) {
  if (!startDateStr) return '-';
  const start = new Date(startDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date(); // Use current time if not closed

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '-';

  let durationMs = end - start;
  if (durationMs < 0) durationMs = 0; // Avoid negative duration

  const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function formatDateTime(dateString) {
  if (!dateString) return '-';
  try {
      const date = new Date(dateString);
      // Check if the date is valid
      if (isNaN(date.getTime())) {
          return '-';
      }
      // Use locale appropriate formatting
      return date.toLocaleString(navigator.language, { // Use browser's locale
          year: 'numeric', month: 'numeric', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
      });
  } catch (e) {
      console.error("Error formatting date:", dateString, e);
      return '-';
  }
}

function getStatusBadgeColor(status) {
  switch (status?.toLowerCase()) {
    case 'open': return 'blue';
    case 'in progress': return 'yellow';
    case 'closed': return 'green';
    default: return 'gray';
  }
}

function getPriorityClass(priority) {
  return `priority-${priority?.toLowerCase() || 'unknown'}`;
}

// --- Tab Navigation ---
function switchToTab(tabName) {
  // Hide all tab content
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Remove active class from all tab buttons
  document.querySelectorAll('.tabs a').forEach(button => {
    button.classList.remove('active');
  });

  // Basic password check (remains client-side for simplicity)
  if (['tickets', 'pedidos', 'feedback', 'statistics'].includes(tabName)) {
    const storedPassword = sessionStorage.getItem(`${tabName}Password`); // Use sessionStorage for temporary access per session
    if (!storedPassword) {
      const password = prompt(`Please enter the password to access the ${tabName} tab:`);
      const correctPassword = "1234"; // Keep this secure or implement proper auth

      if (password !== correctPassword) {
        alert("Incorrect password. Access denied.");
        // Re-activate the previously active tab or default (e.g., dashboard)
        const previousActiveTab = document.querySelector('.tabs a.active')?.getAttribute('data-tab') || 'dashboard';
        switchToTab(previousActiveTab); // Go back
        return;
      }
      sessionStorage.setItem(`${tabName}Password`, password); // Store for the session
    }
  }

  // Show selected tab content
  const selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.classList.add('active');
  }

  // Add active class to selected tab button
  const selectedButton = document.querySelector(`.tabs a[data-tab="${tabName}"]`);
  if (selectedButton) {
    selectedButton.classList.add('active');
  }

  // Refresh content if needed (consider if re-fetch is always necessary)
  if (tabName === 'tickets') {
    displayTickets(); // Assumes tickets array is up-to-date or fetch is called elsewhere
  } else if (tabName === 'statistics' || tabName === 'dashboard') {
    updateDashboardStats(); // Recalculate stats from current 'tickets' array
    initializeCharts();     // Re-initialize charts with current 'tickets' array
  } else if (tabName === 'feedback') {
    updateTicketSelect(); // Update dropdown based on current 'tickets' array
  } else if (tabName === 'pedidos') {
    displayPedidos(); // Assumes 'pedidos' array is up-to-date
  }
}

// --- Data Fetching ---
async function fetchTickets() {
  console.log('Fetching tickets...');
  const tbody = document.querySelector('#ticketsTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="11">Loading tickets...</td></tr>'; // Show loading state

  try {
    const response = await fetch(`${API_BASE}/get-tickets`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    tickets = await response.json();
    console.log('Fetched tickets:', tickets.length);
    displayTickets(); // Display fetched tickets
    updateDashboardStats(); // Update stats based on fetched data
    initializeCharts();     // Initialize charts based on fetched data
    updateTicketSelect();   // Update feedback dropdown
  } catch (error) {
    console.error('Error fetching tickets:', error);
    alert('Failed to load tickets. See console for details.');
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="color: red;">Error loading tickets.</td></tr>';
  }
}

async function fetchPedidos() {
  console.log('Fetching material requests...');
  const tbody = document.getElementById('pedidosTableBody');
   if (tbody) tbody.innerHTML = '<tr><td colspan="8">Loading requests...</td></tr>'; // Show loading state

  try {
    const response = await fetch(`${API_BASE}/get-material-requests`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    pedidos = await response.json();
    console.log('Fetched pedidos:', pedidos.length);
    displayPedidos();
  } catch (error) {
    console.error('Error fetching material requests:', error);
    alert('Failed to load material requests. See console for details.');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color: red;">Error loading requests.</td></tr>';
  }
}

// --- Ticket Display and Filtering ---
function displayTickets() {
  const tbody = document.querySelector('#ticketsTableBody');
  if (!tbody) return; // Exit if table body doesn't exist

  // Get filter values (client-side filtering)
  const statusFilter = document.getElementById('statusFilter').value;
  const teamFilter = document.getElementById('teamFilter').value;
  const assigneeFilter = document.getElementById('assigneeFilter').value;
  const createdFilter = document.getElementById('createdFilter').value;
  const searchQuery = document.getElementById('ticketSearchInput').value.toLowerCase();

  let filteredTickets = tickets; // Start with all fetched tickets

  // Apply filters (adjust field names for Supabase data)
  if (statusFilter !== 'all') {
    filteredTickets = filteredTickets.filter(ticket => ticket.status === statusFilter);
  }
  if (teamFilter !== 'all') {
    filteredTickets = filteredTickets.filter(ticket => ticket.team === teamFilter);
  }
   if (assigneeFilter !== 'all') {
    // Handle null or empty assigned_to for "Unassigned"
    if (assigneeFilter === 'Unassigned') {
      filteredTickets = filteredTickets.filter(ticket => !ticket.assigned_to);
    } else {
      filteredTickets = filteredTickets.filter(ticket => ticket.assigned_to === assigneeFilter);
    }
  }

  // Created date filter
   if (createdFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      let validFilter = true;
      switch(createdFilter) {
        case 'last24hours': filterDate.setHours(now.getHours() - 24); break;
        case 'last7days': filterDate.setDate(now.getDate() - 7); break;
        case 'last30days': filterDate.setDate(now.getDate() - 30); break;
        default: validFilter = false; break;
      }
      if (validFilter) {
          filteredTickets = filteredTickets.filter(ticket => {
              if (!ticket.created_at) return false;
              const ticketDate = new Date(ticket.created_at);
              return ticketDate >= filterDate;
          });
      }
    }

  // Search filter
  if (searchQuery) {
    filteredTickets = filteredTickets.filter(ticket => {
      const createdStr = formatDateTime(ticket.created_at).toLowerCase();
      const closedStr = formatDateTime(ticket.closed_at).toLowerCase();
      return (
        ticket.id.toString().includes(searchQuery) ||
        (ticket.material_type && ticket.material_type.toLowerCase().includes(searchQuery)) ||
        (ticket.location && ticket.location.toLowerCase().includes(searchQuery)) ||
        (ticket.description && ticket.description.toLowerCase().includes(searchQuery)) ||
        (ticket.status && ticket.status.toLowerCase().includes(searchQuery)) ||
        (ticket.team && ticket.team.toLowerCase().includes(searchQuery)) ||
        (ticket.assigned_to && ticket.assigned_to.toLowerCase().includes(searchQuery)) ||
        createdStr.includes(searchQuery) ||
        (ticket.closed_at && closedStr.includes(searchQuery))
      );
    });
  }

  // Sort tickets by ID descending (already done by backend fetch, but good practice)
  // filteredTickets.sort((a, b) => b.id - a.id);

  // Render table
  tbody.innerHTML = ''; // Clear previous content
  if (filteredTickets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11">No tickets found matching your criteria.</td></tr>';
    return;
  }

  filteredTickets.forEach(ticket => {
    const duration = formatDuration(ticket.created_at, ticket.closed_at);
    const row = document.createElement('tr');
    row.className = getPriorityClass(ticket.priority);
    if (ticket.status === 'Closed') {
        row.classList.add('closed'); // Add closed class for specific styling if needed
    }

    row.innerHTML = `
      <td>#${ticket.id}</td>
      <td>${ticket.material_type || '-'}</td>
      <td>${ticket.location || '-'}</td>
      <td>${ticket.description || '-'}</td>
      <td><span class="badge badge-${getStatusBadgeColor(ticket.status)}">${ticket.status}</span></td>
      <td>${ticket.team || '-'}</td>
      <td>
        ${ticket.status === 'Closed' ? (ticket.assigned_to || 'Unassigned') : `
          <select class="form-control assignee-select" data-ticket-id="${ticket.id}">
            <option value="Unassigned" ${!ticket.assigned_to || ticket.assigned_to === 'Unassigned' ? 'selected' : ''}>Unassigned</option>
            <option value="Diogo Rasteiro" ${ticket.assigned_to === 'Diogo Rasteiro' ? 'selected' : ''}>Diogo Rasteiro</option>
            <option value="Tiago Martins" ${ticket.assigned_to === 'Tiago Martins' ? 'selected' : ''}>Tiago Martins</option>
            </select>
        `}
      </td>
      <td>${formatDateTime(ticket.created_at)}</td>
      <td>${formatDateTime(ticket.closed_at)}</td>
      <td>${duration}</td>
      <td>
        <div class="table-actions-wrapper">
           ${ticket.status !== 'Closed' ? `
               <button class="btn btn-close" data-ticket-id="${ticket.id}" title="Close Ticket">
                  <i class="fas fa-check"></i> Close
               </button>
            ` : `
               <button class="btn btn-reopen" data-ticket-id="${ticket.id}" title="Reopen Ticket">
                   <i class="fas fa-undo"></i> Reopen
               </button>
            `}
          <button class="btn btn-delete" data-ticket-id="${ticket.id}" title="Delete Ticket" style="background-color: #da627d;">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Add event listeners for dynamically created buttons/selects AFTER rendering
  addTableActionListeners();
}

function addTableActionListeners() {
    // Assignee Change
    document.querySelectorAll('.assignee-select').forEach(select => {
        select.addEventListener('change', (event) => {
            const ticketId = event.target.getAttribute('data-ticket-id');
            const assignee = event.target.value === 'Unassigned' ? null : event.target.value; // Send null for Unassigned
            assignTicket(parseInt(ticketId, 10), assignee);
        });
    });

    // Close Button
    document.querySelectorAll('.btn-close').forEach(button => {
        button.addEventListener('click', (event) => {
            const ticketId = event.currentTarget.getAttribute('data-ticket-id');
            updateTicketStatus(parseInt(ticketId, 10), 'Closed'); // Explicitly pass 'Closed'
        });
    });

    // Reopen Button
    document.querySelectorAll('.btn-reopen').forEach(button => {
        button.addEventListener('click', (event) => {
            const ticketId = event.currentTarget.getAttribute('data-ticket-id');
            showPasswordModal(parseInt(ticketId, 10)); // Trigger password modal
        });
    });

    // Delete Button
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', (event) => {
            const ticketId = event.currentTarget.getAttribute('data-ticket-id');
            deleteTicket(parseInt(ticketId, 10));
        });
    });
}


// --- Ticket Actions ---
async function assignTicket(ticketId, assignee) {
  const updates = {
    assigned_to: assignee,
    status: assignee ? 'In Progress' : 'Open' // Update status based on assignment
  };
  console.log(`Assigning ticket ${ticketId} to ${assignee}, status: ${updates.status}`);

  try {
    const response = await fetch(`${API_BASE}/update-ticket`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ticketId, updates: updates })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP error! ${response.status}`);

    console.log('Assign success:', result);
    // Re-fetch for consistency, or perform optimistic update
    await fetchTickets();

  } catch (error) {
    console.error('Error assigning ticket:', error);
    alert(`Failed to assign ticket: ${error.message}`);
    await fetchTickets(); // Re-fetch on error to sync UI
  }
}

// Refactored updateTicketStatus to handle explicit status
async function updateTicketStatus(ticketId, newStatus) {
    const updates = { status: newStatus };
    console.log(`Updating ticket ${ticketId} status to ${newStatus}`);

    try {
        const response = await fetch(`${API_BASE}/update-ticket`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: ticketId, updates: updates })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP error! ${response.status}`);

        console.log('Status update success:', result);
        await fetchTickets(); // Re-fetch data for consistency

    } catch (error) {
        console.error(`Error updating ticket status to ${newStatus}:`, error);
        alert(`Failed to update status: ${error.message}`);
    }
}


async function deleteTicket(ticketId) {
  if (!confirm(`Are you sure you want to delete ticket #${ticketId}?`)) {
    return;
  }
  console.log(`Deleting ticket ${ticketId}`);

  try {
    const response = await fetch(`${API_BASE}/delete-ticket?id=${ticketId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP error! ${response.status}`);

    console.log('Delete success:', result);
    alert('Ticket deleted successfully!');
    await fetchTickets(); // Re-fetch to update list

  } catch (error) {
    console.error('Error deleting ticket:', error);
    alert(`Failed to delete ticket: ${error.message}`);
  }
}

// --- Password Modal (Reopen Logic) ---
let ticketToReopen = null;

function showPasswordModal(ticketId) {
  ticketToReopen = ticketId;
  document.getElementById('passwordModal').classList.add('show');
  document.getElementById('reopenPassword').value = '';
  document.getElementById('reopenPassword').focus();
}

function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('show');
  ticketToReopen = null;
}

// Add event listener for password confirmation button
document.getElementById('confirmReopen')?.addEventListener('click', async () => {
  const password = document.getElementById('reopenPassword').value;
  if (password === '1234' && ticketToReopen !== null) { // Basic client-side password check
    closePasswordModal(); // Close modal immediately
    await updateTicketStatus(ticketToReopen, 'Open'); // Call backend to update status
  } else {
    alert('Incorrect password or no ticket selected.');
  }
});

// Add event listener for Enter key in password input
document.getElementById('reopenPassword')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('confirmReopen')?.click();
  }
});

// Close modal when clicking outside
document.getElementById('passwordModal')?.addEventListener('click', function (e) {
  if (e.target === this) {
    closePasswordModal();
  }
});

// --- Material Request Display and Filtering ---
function displayPedidos() {
  const tbody = document.getElementById('pedidosTableBody');
  if (!tbody) return;

  // Client-side filtering (similar to tickets)
  const statusFilter = document.getElementById('pedidoStatusFilter').value;
  const teamFilter = document.getElementById('pedidoTeamFilter').value;
  const priorityFilter = document.getElementById('pedidoPriorityFilter').value;
  const searchQuery = document.getElementById('pedidoSearchInput').value.toLowerCase();

  let filteredPedidos = pedidos; // Start with all fetched pedidos

  if (statusFilter !== 'all') {
    filteredPedidos = filteredPedidos.filter(p => p.status === statusFilter);
  }
  if (teamFilter !== 'all') {
    filteredPedidos = filteredPedidos.filter(p => p.team === teamFilter);
  }
  if (priorityFilter !== 'all') {
    filteredPedidos = filteredPedidos.filter(p => p.priority === priorityFilter);
  }
  if (searchQuery) {
    filteredPedidos = filteredPedidos.filter(p => (
        p.id.toString().includes(searchQuery) ||
        (p.material_type && p.material_type.toLowerCase().includes(searchQuery)) ||
        (p.team && p.team.toLowerCase().includes(searchQuery)) ||
        (p.priority && p.priority.toLowerCase().includes(searchQuery))
    ));
  }

  // Render table
  tbody.innerHTML = '';
  if (filteredPedidos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">No material requests found matching your criteria.</td></tr>';
    return;
  }

  filteredPedidos.forEach(pedido => {
    const row = document.createElement('tr');
    row.className = pedido.status === 'delivered' ? 'status-delivered' : '';

    row.innerHTML = `
      <td>#${pedido.id}</td>
      <td>${pedido.material_type}</td>
      <td>${pedido.team}</td>
      <td><span class="${getPriorityClass(pedido.priority)}">${pedido.priority}</span></td>
      <td>${pedido.quantity}</td>
      <td>${formatDateTime(pedido.created_at)}</td>
      <td>
        <span class="status-badge status-${pedido.status}">
          ${pedido.status === 'delivered' ? 'Entregue' : 'Pendente'}
        </span>
      </td>
      <td>
        <div class="action-buttons">
          ${pedido.status !== 'delivered'
            ? `<button onclick="markAsDelivered(${pedido.id})" class="btn-deliver" title="Mark as Delivered"><i class="fas fa-check"></i></button>`
            : `<button onclick="undoDelivered(${pedido.id})" class="btn-undo" title="Undo Delivered Status"><i class="fas fa-undo"></i></button>`}
          <button onclick="deletePedido(${pedido.id})" class="btn-delete" title="Delete Request"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// --- Material Request Actions ---
async function markAsDelivered(id) {
   console.log(`Marking pedido ${id} as delivered`);
   const updates = { status: 'delivered' }; // Backend function sets delivered_at

   try {
        const response = await fetch(`${API_BASE}/update-material-request`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, updates: updates })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP error! ${response.status}`);

        console.log('Mark delivered success:', result);
        await fetchPedidos(); // Re-fetch to update list

    } catch (error) {
        console.error('Error marking as delivered:', error);
        alert(`Failed to mark as delivered: ${error.message}`);
    }
}

async function undoDelivered(id) {
    console.log(`Undoing delivered status for pedido ${id}`);
    const updates = { status: 'pending' }; // Backend function clears delivered_at

    try {
        const response = await fetch(`${API_BASE}/update-material-request`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, updates: updates })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP error! ${response.status}`);

        console.log('Undo delivered success:', result);
        await fetchPedidos(); // Re-fetch to update list

    } catch (error) {
        console.error('Error undoing delivered status:', error);
        alert(`Failed to undo status: ${error.message}`);
    }
}

async function deletePedido(id) {
  if (!confirm(`Are you sure you want to delete material request #${id}?`)) {
    return;
  }
  console.log(`Deleting pedido ${id}`);

  try {
    const response = await fetch(`${API_BASE}/delete-material-request?id=${id}`, {
      method: 'DELETE'
    });
     const result = await response.json();
     if (!response.ok) throw new Error(result.error || `HTTP error! ${response.status}`);

     console.log('Delete pedido success:', result);
     alert('Material request deleted successfully!');
     await fetchPedidos(); // Re-fetch to update list

  } catch (error) {
     console.error('Error deleting pedido:', error);
     alert(`Failed to delete request: ${error.message}`);
  }
}

// --- Feedback Tab Logic ---
function updateTicketSelect() {
  const select = document.getElementById('feedbackTicketSelect');
  if (!select) return;

  select.innerHTML = '<option value="">Select a ticket...</option>'; // Clear existing options

  // Sort tickets by ID descending
  const sortedTickets = [...tickets].sort((a, b) => b.id - a.id);

  sortedTickets.forEach(ticket => {
    const option = document.createElement('option');
    option.value = ticket.id;
    // Use DB field names
    const titlePart = ticket.material_type || `Ticket #${ticket.id}`;
    const emailPart = ticket.email || 'No Email';
    option.textContent = `${titlePart} (${emailPart})`;
    select.appendChild(option);
  });
   // Reset details when list updates
   updateFeedbackForm();
}

function updateFeedbackForm() {
  const select = document.getElementById('feedbackTicketSelect');
  const detailsContainer = document.getElementById('selectedTicketDetails');
  const subjectInput = document.getElementById('emailSubject');
  const bodyTextarea = document.getElementById('emailBody');
  if (!select || !detailsContainer || !subjectInput || !bodyTextarea) return;

  const ticketId = select.value;

  if (!ticketId) {
    detailsContainer.innerHTML = '';
    subjectInput.value = '';
    bodyTextarea.value = '';
    return;
  }

  const ticket = tickets.find(t => t.id === parseInt(ticketId, 10));
  if (ticket) {
    // Display ticket details (using DB field names)
    detailsContainer.innerHTML = `
      <p><span class="label">Material Type:</span> ${ticket.material_type || '-'}</p>
      <p><span class="label">Location:</span> ${ticket.location || '-'}</p>
      <p><span class="label">Created:</span> ${formatDateTime(ticket.created_at)}</p>
      <p><span class="label">Status:</span> ${ticket.status}</p>
      <p><span class="label">Email:</span> ${ticket.email || 'N/A'}</p>
      <p><span class="label">Team:</span> ${ticket.team || 'N/A'}</p>
      <p><span class="label">Category:</span> ${ticket.category || 'N/A'}</p>
    `;

    // Pre-fill email subject and body
    const ticketInfo = `Detalhes do ticket:\n• ID: #${ticket.id}\n• Tipo: ${ticket.material_type || '-'}\n• Localização: ${ticket.location || '-'}\n• Categoria: ${ticket.category || 'N/A'}\n• Prioridade: ${ticket.priority || 'N/A'}\n• Equipa: ${ticket.team || 'N/A'}\n• Estado: ${ticket.status}\n• Criado em: ${formatDateTime(ticket.created_at)}`;
    const message = `Olá!\n\nO seu ticket foi resolvido com sucesso!\n\n${ticketInfo}\n\nAjuda-nos a melhorar o serviço e responde a este questionário - https://forms.gle/msDQx1pbGbmPNG6N8\n\nObrigado pela colaboração!`;

    subjectInput.value = `Ticket #${ticket.id} - Resolution Notification`;
    bodyTextarea.value = message;
  } else {
      detailsContainer.innerHTML = '<p>Ticket details not found.</p>';
      subjectInput.value = '';
      bodyTextarea.value = '';
  }
}

document.getElementById('feedbackForm')?.addEventListener('submit', function (e) {
  e.preventDefault();
  const ticketId = document.getElementById('feedbackTicketSelect').value;
  const ticket = tickets.find(t => t.id === parseInt(ticketId, 10));

  if (!ticket || !ticket.email) {
    alert('Please select a ticket with a valid email address.');
    return;
  }

  const subject = document.getElementById('emailSubject').value;
  const body = document.getElementById('emailBody').value;
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);

  // Create mailto link (less reliable) or Gmail link
  // const mailtoLink = `mailto:${ticket.email}?subject=${encodedSubject}&body=${encodedBody}`;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${ticket.email}&su=${encodedSubject}&body=${encodedBody}`;

  window.open(gmailUrl, '_blank');
  alert(`Email draft opened in Gmail for ${ticket.email}. Please review and send manually.`);
});


// --- Dashboard and Statistics ---

// Helper to calculate average resolution time in hours
function calculateAvgResolutionHours(ticketList) {
  const closedTickets = ticketList.filter(t => t.status === 'Closed' && t.created_at && t.closed_at);
  if (closedTickets.length === 0) return 0;

  const totalTime = closedTickets.reduce((acc, ticket) => {
    const created = new Date(ticket.created_at);
    const closed = new Date(ticket.closed_at);
    if (isNaN(created.getTime()) || isNaN(closed.getTime())) return acc; // Skip invalid dates
    return acc + (closed - created); // Duration in milliseconds
  }, 0);

  return (totalTime / closedTickets.length) / (1000 * 60 * 60); // Average in hours
}

// Helper to format hours into days/hours string
function formatHours(hours) {
    if (hours === 0 || isNaN(hours)) return '-';
    const avgTimeInDays = hours / 24;
    if (avgTimeInDays >= 1) {
        return avgTimeInDays.toFixed(1) + ' days';
    } else {
        return Math.round(hours) + ' hours';
    }
}

// Update all dashboard stats based on the current 'tickets' array
function updateDashboardStats() {
    console.log("Updating dashboard stats...");
    const selectedMonth = document.getElementById('dashboardMonthSelect').value;
    let periodTickets = tickets; // Use the globally fetched tickets

    // Filter tickets based on selected month (if not 'all')
    if (selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-');
        periodTickets = tickets.filter(ticket => {
            if (!ticket.created_at) return false;
            const ticketDate = new Date(ticket.created_at);
            return ticketDate.getFullYear() === parseInt(year) &&
                   ticketDate.getMonth() === parseInt(month) - 1;
        });
    }

    // --- Global Performance Metrics ---
    const globalTotalTickets = periodTickets.length;
    const globalResolvedTickets = periodTickets.filter(t => t.status === 'Closed').length;
    const globalOpenTickets = periodTickets.filter(t => t.status === 'Open').length; // Only 'Open' status
    const globalInProgressTickets = periodTickets.filter(t => t.status === 'In Progress').length;
    const globalActiveTickets = globalOpenTickets + globalInProgressTickets; // Open + In Progress
    const globalResolutionRate = globalTotalTickets > 0 ? (globalResolvedTickets / globalTotalTickets * 100) : 0;

    document.getElementById('dashboardTotalTicketsCount').textContent = globalTotalTickets;
    document.getElementById('dashboardResolvedTicketsCount').textContent = globalResolvedTickets;
    document.getElementById('dashboardOpenTicketsCountStats').textContent = globalActiveTickets; // Show active count here
    document.getElementById('dashboardGlobalResolutionRate').textContent = globalResolutionRate.toFixed(1) + '%';

    // Global Average Response Time (Placeholder - needs better definition: time to first assignment/action)
    // For now, let's use average age of *active* tickets
    let globalAvgActiveAge = '-';
     if (globalActiveTickets > 0) {
        const totalActiveTime = periodTickets
            .filter(t => t.status === 'Open' || t.status === 'In Progress')
            .reduce((acc, ticket) => {
                const created = new Date(ticket.created_at);
                const now = new Date();
                if (isNaN(created.getTime())) return acc;
                return acc + (now - created);
            }, 0);
         const avgHours = (totalActiveTime / globalActiveTickets) / (1000 * 60 * 60);
         globalAvgActiveAge = formatHours(avgHours);
     }
    document.getElementById('dashboardGlobalAvgResponseTime').textContent = globalAvgActiveAge;


    // --- Open Tickets Card ---
    document.getElementById('openTicketsCount').textContent = globalActiveTickets; // Display active tickets

    // Trend calculation (simple example: compare current active with total active last month)
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonthActiveTickets = tickets.filter(t => { // Filter ALL tickets for last month
      if (!t.created_at) return false;
      const ticketDate = new Date(t.created_at);
      return ticketDate.getMonth() === lastMonthDate.getMonth() &&
             ticketDate.getFullYear() === lastMonthDate.getFullYear() &&
             (t.status === 'Open' || t.status === 'In Progress');
    }).length;

    const trend = globalActiveTickets - lastMonthActiveTickets;
    const trendElement = document.getElementById('openTicketsTrend');
    const trendIcon = trendElement.querySelector('.trend-icon');
    const trendValue = trendElement.querySelector('.trend-value');

    trendIcon.className = 'trend-icon ' + (trend < 0 ? 'down' : 'up'); // Down if less active, Up if same or more
    trendValue.textContent = trend !== 0 ? `${Math.abs(trend)} ${trend > 0 ? 'more' : 'less'} than last month` : 'No change from last month';


    // --- Performance Overview (Targets) ---
    const avgResolutionHours = calculateAvgResolutionHours(periodTickets);
    const avgResolutionTimeFormatted = formatHours(avgResolutionHours);

    // Update dashboard resolution time metrics
    const dashboardResTimeElement = document.getElementById('dashboardAvgResolutionTime');
    const dashboardResTimeIndicator = document.getElementById('dashboardResolutionTimeIndicator');
    const dashboardResTimeProgress = document.getElementById('dashboardResolutionTimeProgress');

    dashboardResTimeElement.textContent = avgResolutionTimeFormatted;
    if (avgResolutionHours > 0) {
      const timeProgress = Math.min(Math.max(0, (48 - avgResolutionHours) / 48 * 100), 100); // Ensure 0-100
      const timeStatus = avgResolutionHours <= 48 ? 'success' : 'danger';

      dashboardResTimeElement.className = `target-value ${timeStatus}`;
      dashboardResTimeIndicator.textContent = avgResolutionHours <= 48 ? '✓ Meeting target' : '✗ Above target';
      dashboardResTimeIndicator.className = `target-indicator ${timeStatus}`;
      dashboardResTimeProgress.style.width = `${timeProgress}%`;
      dashboardResTimeProgress.className = `progress-bar ${timeStatus}`;
    } else {
      dashboardResTimeElement.className = 'target-value';
      dashboardResTimeIndicator.textContent = (globalResolvedTickets > 0) ? 'Calculating...' : 'No closed tickets';
      dashboardResTimeIndicator.className = 'target-indicator';
      dashboardResTimeProgress.style.width = '0%';
       dashboardResTimeProgress.className = 'progress-bar';
    }


    // Update dashboard resolution rate metrics
    const resolutionRateValue = globalResolutionRate; // Calculated above
    const dashboardResRatioElement = document.getElementById('dashboardResolutionRatio');
    const dashboardResRateIndicator = document.getElementById('dashboardResolutionRateIndicator');
    const dashboardResRateProgress = document.getElementById('dashboardResolutionRateProgress');

    dashboardResRatioElement.textContent = resolutionRateValue.toFixed(1) + '%';

    if (globalTotalTickets > 0) {
      const rateStatus = resolutionRateValue >= 95 ? 'success' :
                         resolutionRateValue >= 85 ? 'warning' : 'danger';

      dashboardResRatioElement.className = `target-value ${rateStatus}`;
      dashboardResRateIndicator.textContent = resolutionRateValue >= 95 ? '✓ Meeting target' :
                                              `↑ ${(95 - resolutionRateValue).toFixed(1)}% to target`;
      dashboardResRateIndicator.className = `target-indicator ${rateStatus}`;
      dashboardResRateProgress.style.width = `${resolutionRateValue}%`;
      dashboardResRateProgress.className = `progress-bar ${rateStatus}`;
    } else {
      dashboardResRatioElement.className = 'target-value';
      dashboardResRateIndicator.textContent = 'No tickets';
      dashboardResRateIndicator.className = 'target-indicator';
      dashboardResRateProgress.style.width = '0%';
      dashboardResRateProgress.className = 'progress-bar';
    }

     // --- Update Stats Tab Specific Metrics ---
     updateStatsTabMetrics(periodTickets);
     updateTeamMetrics(periodTickets);
     updateAssigneeStats(periodTickets); // Update assignee specific stats
}

// Function to update metrics specifically on the Statistics tab
function updateStatsTabMetrics(periodTickets) {
    const totalTicketsElem = document.getElementById('totalTicketsCount');
    const resolvedTicketsElem = document.getElementById('resolvedTicketsCount');
    const openTicketsElem = document.getElementById('statsOpenTicketsCount'); // Use stats tab ID
    const resolutionRateElem = document.getElementById('statsGlobalResolutionRate'); // Use stats tab ID
    const avgResponseTimeElem = document.getElementById('statsGlobalAvgResponseTime'); // Use stats tab ID
    const highPriorityElem = document.getElementById('highPriorityCount');
    const avgResolutionTimeKPITime = document.getElementById('avgResolutionTime');
    const resolutionRatioKPI = document.getElementById('resolutionRatio');
    const resolutionTimeIndicatorKPI = document.getElementById('resolutionTimeIndicator');
    const resolutionRateIndicatorKPI = document.getElementById('resolutionRateIndicator');
    const resolutionTimeProgressKPI = document.getElementById('resolutionTimeProgress');
    const resolutionRateProgressKPI = document.getElementById('resolutionRateProgress');


    const totalTickets = periodTickets.length;
    const resolvedTickets = periodTickets.filter(t => t.status === 'Closed').length;
    const activeTickets = periodTickets.filter(t => t.status === 'Open' || t.status === 'In Progress').length;
    const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets * 100) : 0;
    const avgResolutionHours = calculateAvgResolutionHours(periodTickets);
     const avgResolutionTimeFormatted = formatHours(avgResolutionHours);

     // Placeholder for Avg Response Time (using active age for now)
     let avgActiveAge = '-';
     if (activeTickets > 0) {
        const totalActiveTime = periodTickets
            .filter(t => t.status === 'Open' || t.status === 'In Progress')
            .reduce((acc, ticket) => {
                const created = new Date(ticket.created_at);
                const now = new Date();
                 if (isNaN(created.getTime())) return acc;
                return acc + (now - created);
            }, 0);
         const avgHours = (totalActiveTime / activeTickets) / (1000 * 60 * 60);
         avgActiveAge = formatHours(avgHours);
     }

    if (totalTicketsElem) totalTicketsElem.textContent = totalTickets;
    if (resolvedTicketsElem) resolvedTicketsElem.textContent = resolvedTickets;
    if (openTicketsElem) openTicketsElem.textContent = activeTickets;
    if (resolutionRateElem) resolutionRateElem.textContent = resolutionRate.toFixed(1) + '%';
    if (avgResponseTimeElem) avgResponseTimeElem.textContent = avgActiveAge;

    // High/Critical Priority Count
    const highCritCount = periodTickets.filter(t => t.priority === 'High' || t.priority === 'Critical').length;
    if (highPriorityElem) highPriorityElem.textContent = highCritCount;

     // Update KPI targets on Stats Tab
    if (avgResolutionTimeKPITime) avgResolutionTimeKPITime.textContent = avgResolutionTimeFormatted;
    if (resolutionRatioKPI) resolutionRatioKPI.textContent = resolutionRate.toFixed(1) + '%';

     if (avgResolutionHours > 0) {
      const timeStatus = avgResolutionHours <= 48 ? 'success' : 'danger';
      if (resolutionTimeIndicatorKPI) {
        resolutionTimeIndicatorKPI.textContent = avgResolutionHours <= 48 ? '✓ Target' : '✗ Missed';
        resolutionTimeIndicatorKPI.className = `target-indicator ${timeStatus}`;
      }
       if (resolutionTimeProgressKPI) {
           const timeProgress = Math.min(Math.max(0, (48 - avgResolutionHours) / 48 * 100), 100);
           resolutionTimeProgressKPI.style.width = `${timeProgress}%`;
           resolutionTimeProgressKPI.className = `progress-bar ${timeStatus}`;
       }

    } else {
       if (resolutionTimeIndicatorKPI) resolutionTimeIndicatorKPI.textContent = 'N/A';
       if (resolutionTimeProgressKPI) resolutionTimeProgressKPI.style.width = '0%';
    }

     if (totalTickets > 0) {
      const rateStatus = resolutionRate >= 95 ? 'success' : resolutionRate >= 85 ? 'warning' : 'danger';
       if (resolutionRateIndicatorKPI) {
           resolutionRateIndicatorKPI.textContent = resolutionRate >= 95 ? '✓ Target' : '↓ Below';
           resolutionRateIndicatorKPI.className = `target-indicator ${rateStatus}`;
       }
       if (resolutionRateProgressKPI) {
           resolutionRateProgressKPI.style.width = `${resolutionRate}%`;
            resolutionRateProgressKPI.className = `progress-bar ${rateStatus}`;
       }

    } else {
       if (resolutionRateIndicatorKPI) resolutionRateIndicatorKPI.textContent = 'N/A';
       if (resolutionRateProgressKPI) resolutionRateProgressKPI.style.width = '0%';
    }
}


function updateTeamMetrics(periodTickets) {
  const teamMetricsContainer = document.getElementById('teamMetrics');
  if (!teamMetricsContainer) return;

  const teams = ['Exotec', 'Volumosos', 'Heteroclítos', 'ServiceLog', 'Cais', 'Eccomerce', 'Bicicletas']; // Example teams
  let teamMetricsHTML = '';

  teams.forEach(team => {
    const teamTickets = periodTickets.filter(t => t.team === team);
    const resolvedCount = teamTickets.filter(t => t.status === 'Closed').length;
    const activeCount = teamTickets.filter(t => t.status !== 'Closed').length;
    const totalCount = teamTickets.length;
    const resolutionRate = totalCount > 0 ? (resolvedCount / totalCount * 100) : 0;
    const avgResHours = calculateAvgResolutionHours(teamTickets); // Pass only team tickets
    const avgResTimeFormatted = formatHours(avgResHours);


    teamMetricsHTML += `
      <div class="team-item">
        <div class="team-header">
          <span class="team-name">${team}</span>
          <span class="team-stats">${resolutionRate.toFixed(1)}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Resolved/Total</span>
          <span class="metric-value">${resolvedCount}/${totalCount}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Active Tickets</span>
          <span class="metric-value">${activeCount}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Avg. Resolution</span>
          <span class="metric-value">${avgResTimeFormatted}</span>
        </div>
      </div>
    `;
  });

  teamMetricsContainer.innerHTML = teamMetricsHTML || '<p>No team data available.</p>';
}

function updateAssigneeStats(periodTickets) {
    const assignees = ['Diogo Rasteiro', 'Tiago Martins']; // Example assignees
    assignees.forEach(assignee => {
        const assigneeTickets = periodTickets.filter(t => t.assigned_to === assignee);
        const resolvedCount = assigneeTickets.filter(t => t.status === 'Closed').length;
        const totalCount = assigneeTickets.length;
        const activeCount = assigneeTickets.filter(t => t.status !== 'Closed').length;
        const resolutionRate = totalCount > 0 ? (resolvedCount / totalCount * 100) : 0;
        const avgResHours = calculateAvgResolutionHours(assigneeTickets); // Pass only assignee tickets
        const avgResTimeFormatted = formatHours(avgResHours);

        // Update UI elements for each assignee
        const statsElemId = assignee.toLowerCase().replace(' ', '') + 'Stats';
        const avgTimeElemId = assignee.toLowerCase().replace(' ', '') + 'AvgTime';
        const loadElemId = assignee.toLowerCase().replace(' ', '') + 'Load';

        const statsElem = document.getElementById(statsElemId);
        const avgTimeElem = document.getElementById(avgTimeElemId);
        const loadElem = document.getElementById(loadElemId);

        if (statsElem) statsElem.textContent = `${resolvedCount}/${totalCount} (${resolutionRate.toFixed(0)}%)`;
        if (avgTimeElem) avgTimeElem.textContent = avgResTimeFormatted;
        if (loadElem) loadElem.textContent = `${activeCount} active`;
    });
}


// --- Chart Initialization and Updates ---
function initializeCharts() {
    console.log("Initializing charts with current tickets data...");
    // Pass the currently filtered tickets if applicable, or all tickets
    const selectedMonth = document.getElementById('dashboardMonthSelect').value;
    let periodTickets = tickets;
    if (selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-');
        periodTickets = tickets.filter(ticket => {
            if (!ticket.created_at) return false;
            const ticketDate = new Date(ticket.created_at);
            return ticketDate.getFullYear() === parseInt(year) &&
                   ticketDate.getMonth() === parseInt(month) - 1;
        });
    }

    // Destroy existing charts before creating new ones
    Object.values(currentCharts).forEach(chart => chart?.destroy());
    currentCharts = {}; // Reset the storage


    // Configuration for charts (reuse structure)
    const chartConfigs = getChartConfigs(periodTickets);

    if (document.getElementById('resolutionTimeChart')) {
        currentCharts.resolutionTime = new Chart(document.getElementById('resolutionTimeChart'), chartConfigs.resolutionTime);
    }
     if (document.getElementById('resolutionRateChart')) {
        currentCharts.resolutionRate = new Chart(document.getElementById('resolutionRateChart'), chartConfigs.resolutionRate);
    }
    if (document.getElementById('teamChart')) {
         currentCharts.team = new Chart(document.getElementById('teamChart'), chartConfigs.team);
    }
    if (document.getElementById('categoryChart')) {
         currentCharts.category = new Chart(document.getElementById('categoryChart'), chartConfigs.category);
    }
    if (document.getElementById('priorityChart')) {
         currentCharts.priority = new Chart(document.getElementById('priorityChart'), chartConfigs.priority);
    }
     if (document.getElementById('assigneeChart')) {
         currentCharts.assignee = new Chart(document.getElementById('assigneeChart'), chartConfigs.assignee);
    }
}

function getChartConfigs(periodTickets) {
  const colors = { blue: '#3B82F6', green: '#10B981', yellow: '#F59E0B', red: '#EF4444', purple: '#8B5CF6', orange: '#F97316', teal: '#14B8A6', gray: '#6B7280' };
  const monthlyData = getMonthlyData(6); // Get data for the last 6 months from ALL tickets

  // --- Resolution Time Chart Config ---
  const resolutionTimeConfig = {
      type: 'line',
      data: {
          labels: monthlyData.labels,
          datasets: [
              { label: 'Avg Resolution Time (hours)', data: monthlyData.avgResolutionTimes, borderColor: colors.blue, backgroundColor: colors.blue + '20', tension: 0.4, fill: true },
              { label: '48h Target', data: Array(monthlyData.labels.length).fill(48), borderColor: colors.red, borderWidth: 2, borderDash: [5, 5], fill: false, pointRadius: 0 }
          ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } }, plugins: { legend: { position: 'bottom' }, title: { display: false } } }
  };

   // --- Resolution Rate Chart Config ---
   const resolutionRateConfig = {
      type: 'line',
      data: {
          labels: monthlyData.labels,
          datasets: [
              { label: 'Resolution Rate (%)', data: monthlyData.resolutionRates, borderColor: colors.green, backgroundColor: colors.green + '20', tension: 0.4, fill: true },
              { label: '95% Target', data: Array(monthlyData.labels.length).fill(95), borderColor: colors.red, borderWidth: 2, borderDash: [5, 5], fill: false, pointRadius: 0 }
          ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Percentage' } } }, plugins: { legend: { position: 'bottom' }, title: { display: false } } }
  };

    // --- Team Chart Config (using periodTickets for current view) ---
    const teams = ['Exotec', 'Volumosos', 'Heteroclítos', 'ServiceLog', 'Cais', 'Eccomerce', 'Bicicletas'];
    const teamData = teams.map(team => {
        const teamTickets = periodTickets.filter(t => t.team === team);
        return {
            active: teamTickets.filter(t => t.status !== 'Closed').length,
            resolved: teamTickets.filter(t => t.status === 'Closed').length
        };
    });
    const teamConfig = {
        type: 'bar',
        data: {
            labels: teams,
            datasets: [
                { label: 'Active Tickets', data: teamData.map(d => d.active), backgroundColor: colors.blue },
                { label: 'Resolved Tickets', data: teamData.map(d => d.resolved), backgroundColor: colors.green }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Tickets by Team' } } }
    };

    // --- Category Chart Config (using periodTickets) ---
     const categories = ['Hardware', 'Software', 'Network', 'Account', 'Other'];
     const categoryData = categories.map(cat => {
        const catTickets = periodTickets.filter(t => t.category === cat);
        return {
            active: catTickets.filter(t => t.status !== 'Closed').length,
            resolved: catTickets.filter(t => t.status === 'Closed').length
        };
    });
    const categoryConfig = {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [
                { label: 'Active Tickets', data: categoryData.map(d => d.active), backgroundColor: colors.purple },
                { label: 'Resolved Tickets', data: categoryData.map(d => d.resolved), backgroundColor: colors.teal }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Tickets by Category' } } }
    };

     // --- Priority Chart Config (using periodTickets) ---
     const priorities = ['Critical', 'High', 'Medium', 'Low'];
     const priorityData = priorities.map(prio => {
        const prioTickets = periodTickets.filter(t => t.priority === prio);
        return {
            active: prioTickets.filter(t => t.status !== 'Closed').length,
            resolved: prioTickets.filter(t => t.status === 'Closed').length
        };
    });
     const priorityConfig = {
        type: 'bar',
        data: {
            labels: priorities,
            datasets: [
                { label: 'Active Tickets', data: priorityData.map(d => d.active), backgroundColor: colors.orange },
                { label: 'Resolved Tickets', data: priorityData.map(d => d.resolved), backgroundColor: colors.gray }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Tickets by Priority' } } }
    };

    // --- Assignee Trend Chart Config (using monthlyData) ---
     const assigneeConfig = {
      type: 'line',
      data: {
          labels: monthlyData.labels,
          datasets: [
              { label: 'Diogo Rasteiro Resolved', data: monthlyData.diogoPerformance, borderColor: colors.blue, backgroundColor: colors.blue + '20', tension: 0.4, fill: true },
              { label: 'Tiago Martins Resolved', data: monthlyData.tiagoPerformance, borderColor: colors.green, backgroundColor: colors.green + '20', tension: 0.4, fill: true }
          ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'Resolved Tickets' } } }, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Monthly Resolved Tickets by Assignee'} } }
  };


    return { resolutionTime: resolutionTimeConfig, resolutionRate: resolutionRateConfig, team: teamConfig, category: categoryConfig, priority: priorityConfig, assignee: assigneeConfig };
}


function getMonthlyData(monthsCount) {
  const result = {
    labels: [],
    avgResolutionTimes: [],
    resolutionRates: [],
    diogoPerformance: [], // Resolved tickets count
    tiagoPerformance: []  // Resolved tickets count
  };

  for (let i = monthsCount - 1; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthYearLabel = date.toLocaleString('default', { month: 'short', year: 'numeric' }); // e.g., Apr 2025
    result.labels.push(monthYearLabel);

    // Filter ALL tickets for this specific month
    const monthTickets = tickets.filter(ticket => {
      if (!ticket.created_at) return false;
      const ticketDate = new Date(ticket.created_at);
      return ticketDate.getMonth() === date.getMonth() &&
             ticketDate.getFullYear() === date.getFullYear();
    });

    // Calculate metrics for the month
    const avgResHours = calculateAvgResolutionHours(monthTickets);
    result.avgResolutionTimes.push(avgResHours);

    const resolvedCount = monthTickets.filter(t => t.status === 'Closed').length;
    const totalCount = monthTickets.length;
    const resRate = totalCount > 0 ? (resolvedCount / totalCount * 100) : 0;
    result.resolutionRates.push(resRate);

    // Assignee performance (resolved count)
    result.diogoPerformance.push(monthTickets.filter(t => t.status === 'Closed' && t.assigned_to === 'Diogo Rasteiro').length);
    result.tiagoPerformance.push(monthTickets.filter(t => t.status === 'Closed' && t.assigned_to === 'Tiago Martins').length);
  }
  return result;
}


// --- Month Selectors ---
function initializeMonthSelector(selectorId) {
    const monthSelect = document.getElementById(selectorId);
    if (!monthSelect || monthSelect.options.length > 1) return; // Already initialized or doesn't exist

    const months = new Set();
    tickets.forEach(ticket => {
        if (!ticket.created_at) return;
        const date = new Date(ticket.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
        months.add(monthKey);
    });

    const sortedMonths = Array.from(months).sort().reverse();

    sortedMonths.forEach(month => {
        const [year, monthNum] = month.split('-');
        const date = new Date(year, monthNum - 1);
        const monthName = date.toLocaleString('default', { month: 'long' });
        const option = new Option(`${monthName} ${year}`, month);
        monthSelect.add(option);
    });
}

function initializeDashboardMonthSelector() {
    initializeMonthSelector('dashboardMonthSelect');
}
function initializeKPIMonthSelector() {
     initializeMonthSelector('kpiMonthSelect');
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Tab Switching
  document.querySelectorAll('.tabs a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchToTab(link.getAttribute('data-tab'));
    });
  });

  // Ticket Form Submission (handled in HTML modifications section)
  const ticketForm = document.getElementById('ticketForm');
    if (ticketForm) {
      ticketForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const submitButton = ticketForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';

        const emailPrefix = document.getElementById('email').value;
        const fullEmail = emailPrefix ? `${emailPrefix}@decathlon.com` : '';

        const newTicketData = {
          material_type: document.getElementById('materialType').value, // Use snake_case for DB
          location: document.getElementById('location').value,
          priority: document.getElementById('priority').value,
          category: document.getElementById('category').value,
          team: document.getElementById('team').value,
          description: document.getElementById('description').value,
          email: fullEmail
        };

        try {
          const response = await fetch(`${API_BASE}/create-ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTicketData),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);

          alert('Ticket submitted successfully!');
          ticketForm.reset();
          await fetchTickets(); // Refresh list
          switchToTab('tickets');

        } catch (error) {
          console.error('Error submitting ticket:', error);
          alert(`Failed to submit ticket: ${error.message}`);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit Ticket';
        }
      });
    }


  // Material Request Form Submission (handled in HTML modifications section)
   const materialRequestForm = document.getElementById('materialRequestForm');
     if (materialRequestForm) {
       materialRequestForm.addEventListener('submit', async function(e) {
           e.preventDefault();
           const submitButton = materialRequestForm.querySelector('button[type="submit"]');
           submitButton.disabled = true;
           submitButton.textContent = 'Submitting...';

            const requestData = {
                material_type: document.getElementById('pedidoMaterialType').value, // Use snake_case
                team: document.getElementById('pedidoTeam').value,
                priority: document.getElementById('pedidoPriority').value,
                quantity: parseInt(document.getElementById('pedidoQuantity').value, 10)
            };

            if (!requestData.material_type || !requestData.team || !requestData.priority || isNaN(requestData.quantity) || requestData.quantity <= 0) {
                alert('Please fill in all fields with valid values.');
                submitButton.disabled = false;
                submitButton.textContent = 'Submit Request';
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/create-material-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', },
                    body: JSON.stringify(requestData),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || `HTTP error! status: ${response.status}`);

                alert('Material request submitted successfully!');
                materialRequestForm.reset();
                await fetchPedidos(); // Refresh list
                switchToTab('pedidos');

            } catch (error) {
                console.error('Error submitting material request:', error);
                alert(`Failed to submit request: ${error.message}`);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Submit Request';
            }
       });
     }


  // Ticket Filters
  document.getElementById('statusFilter')?.addEventListener('change', displayTickets);
  document.getElementById('teamFilter')?.addEventListener('change', displayTickets);
  document.getElementById('assigneeFilter')?.addEventListener('change', displayTickets);
  document.getElementById('createdFilter')?.addEventListener('change', displayTickets);
  document.getElementById('ticketSearchInput')?.addEventListener('input', () => {
      // Optional: Add debounce if needed
      displayTickets();
  });


  // Pedido Filters
   document.getElementById('pedidoStatusFilter')?.addEventListener('change', displayPedidos);
   document.getElementById('pedidoTeamFilter')?.addEventListener('change', displayPedidos);
   document.getElementById('pedidoPriorityFilter')?.addEventListener('change', displayPedidos);
   document.getElementById('pedidoSearchInput')?.addEventListener('input', () => {
        // Optional: Add debounce
        displayPedidos();
    });


  // Dashboard Month Selector
  document.getElementById('dashboardMonthSelect')?.addEventListener('change', () => {
        updateDashboardStats();
        initializeCharts(); // Re-initialize charts with filtered data
   });

   // Statistics Tab Month Selector
   document.getElementById('kpiMonthSelect')?.addEventListener('change', () => {
        updateDashboardStats(); // Re-run stats calculation for the selected month
        initializeCharts(); // Optionally re-init charts for stats tab too, if they differ
   });

  // Initial call to setup dynamic elements dependent on fetched data
  initializeDashboardMonthSelector();
  initializeKPIMonthSelector();

}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');
  setupEventListeners(); // Setup static listeners first
  fetchTickets();     // Fetch initial ticket data
  fetchPedidos();     // Fetch initial pedido data
  switchToTab('dashboard'); // Start on the dashboard
});