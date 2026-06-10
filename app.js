'use strict';

const STORAGE_KEY = 'pmoptimal.state';
const STATE_VERSION = 2;

const DEFAULT_STATE = {
  version: STATE_VERSION,
  projects: [],
  tasks: [],
  actionItems: [],
  selectedProjectId: null,
  selectedTaskId: null,
  savedAt: null
};

let state = loadState();
let confirmCallback = null;
let toastTimer = null;

const app = document.querySelector('#app');
const projectDialog = document.querySelector('#project-dialog');
const projectForm = document.querySelector('#project-form');
const taskDialog = document.querySelector('#task-dialog');
const taskForm = document.querySelector('#task-form');
const actionDialog = document.querySelector('#action-dialog');
const actionForm = document.querySelector('#action-form');
const confirmDialog = document.querySelector('#confirm-dialog');
const toast = document.querySelector('#toast');

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.projects) || !Array.isArray(stored.tasks)) {
      return structuredClone(DEFAULT_STATE);
    }
    const loaded = { ...structuredClone(DEFAULT_STATE), ...stored, version: STATE_VERSION };
    loaded.actionItems = Array.isArray(stored.actionItems) ? stored.actionItems : [];
    loaded.tasks = stored.tasks.map(task => ({
      ...task,
      startDate: task.startDate || '',
      endDate: task.endDate || task.dueDate || ''
    }));
    return loaded;
  } catch (error) {
    console.warn('Could not read saved PMOptimal data.', error);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(message = 'Changes saved') {
  state.savedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const status = document.querySelector('#save-status');
    if (status) status.innerHTML = '<i></i> All changes saved';
    if (message) showToast(message);
  } catch (error) {
    showToast('Could not save changes in this browser');
    console.error(error);
  }
}

function createId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function formatDate(value, fallback = 'No date') {
  if (!value) return fallback;
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function relativeDue(value) {
  if (!value) return 'No due date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${value}T00:00:00`);
  const difference = Math.round((date - today) / 86400000);
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  if (difference === 0) return 'Due today';
  if (difference === 1) return 'Due tomorrow';
  return `Due in ${difference}d`;
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map(part => part[0]).join('').toUpperCase() : '—';
}

function projectInitial(project) {
  return initials(project.name).slice(0, 2);
}

function colorForId(id) {
  const palettes = [
    ['#4963d6', '#eef1ff'], ['#b36a25', '#fff2e5'], ['#287a67', '#e8f6f1'],
    ['#8a55b2', '#f4ebfb'], ['#ba5262', '#fff0f2'], ['#417aa4', '#eaf4fb']
  ];
  const sum = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return palettes[sum % palettes.length];
}

function labelFor(value) {
  return value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function tasksForProject(projectId) {
  return state.tasks.filter(task => task.projectId === projectId);
}

function actionsForTask(taskId) {
  return state.actionItems.filter(action => action.taskId === taskId);
}

function taskEndDate(task) {
  return task.endDate || task.dueDate || '';
}

function projectProgress(projectId) {
  const tasks = tasksForProject(projectId);
  if (!tasks.length) return 0;
  return Math.round(tasks.filter(task => task.status === 'completed').length / tasks.length * 100);
}

function isDateOverdue(value, status) {
  if (!value || status === 'completed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T00:00:00`) < today;
}

function isTaskOverdue(task) {
  return isDateOverdue(taskEndDate(task), task.status);
}

function isActionOverdue(action) {
  return isDateOverdue(action.dueDate, action.status);
}

function getMetrics() {
  const overdueTasks = state.tasks.filter(isTaskOverdue).length;
  const overdueActions = state.actionItems.filter(isActionOverdue).length;
  return {
    totalProjects: state.projects.length,
    activeProjects: state.projects.filter(project => project.status === 'active').length,
    openTasks: state.tasks.filter(task => task.status !== 'completed').length,
    openActions: state.actionItems.filter(action => action.status !== 'completed').length,
    completedTasks: state.tasks.filter(task => task.status === 'completed').length,
    completedActions: state.actionItems.filter(action => action.status === 'completed').length,
    overdueTasks,
    overdueActions,
    overdueWork: overdueTasks + overdueActions
  };
}

function getRoute() {
  const hash = location.hash.slice(1) || 'dashboard';
  const projectMatch = hash.match(/^projects\/([^/]+)$/);
  if (projectMatch) return { name: 'project', id: decodeURIComponent(projectMatch[1]) };
  if (hash === 'projects') return { name: 'projects' };
  return { name: 'dashboard' };
}

function render() {
  const route = getRoute();
  document.querySelectorAll('.nav-link').forEach(link => {
    const activeRoute = route.name === 'project' ? 'projects' : route.name;
    link.classList.toggle('active', link.dataset.route === activeRoute);
  });

  if (route.name === 'project') {
    const project = state.projects.find(item => item.id === route.id);
    if (!project) {
      location.hash = '#projects';
      return;
    }
    state.selectedProjectId = project.id;
    renderProjectDetail(project);
  } else if (route.name === 'projects') {
    renderProjects();
  } else {
    renderDashboard();
  }

  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('#mobile-menu').setAttribute('aria-expanded', 'false');
}

function renderDashboard() {
  const metrics = getMetrics();
  const activeProjects = state.projects.filter(project => project.status !== 'completed').slice(0, 5);
  const upcoming = [
    ...state.tasks
      .filter(task => task.status !== 'completed' && taskEndDate(task))
      .map(task => ({ type: 'Task', title: task.title, date: taskEndDate(task), task, projectId: task.projectId })),
    ...state.actionItems
      .filter(action => action.status !== 'completed' && action.dueDate)
      .map(action => {
        const task = state.tasks.find(item => item.id === action.taskId);
        return { type: 'Action', title: action.title, date: action.dueDate, action, task, projectId: task?.projectId };
      })
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  app.innerHTML = `
    <div class="page-wrap">
      <div class="page-header">
        <div><span class="eyebrow">Portfolio overview</span><h1>Good work starts with a clear plan.</h1><p class="page-subtitle">A focused view of your projects, progress, tasks, and action items that need attention.</p></div>
      </div>
      <div class="metric-grid">
        ${metricCard('Projects', metrics.totalProjects, `${metrics.activeProjects} currently active`, '#4263eb', '#eef1ff', '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4l2 2H18.5A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-12Z"/>')}
        ${metricCard('Open tasks', metrics.openTasks, 'Across all projects', '#8a55b2', '#f4ebfb', '<path d="M9 11h8M9 15h6M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>')}
        ${metricCard('Open actions', metrics.openActions, `${metrics.completedActions} completed`, '#b36a25', '#fff2e5', '<path d="m9 11 2 2 4-4M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/>')}
        ${metricCard('Completed tasks', metrics.completedTasks, 'Tasks completed', '#1f9d68', '#e8f7f0', '<path d="M20 11.1V12a8 8 0 1 1-4.7-7.3M20 5l-9 9-3-3"/>')}
        ${metricCard('Overdue work', metrics.overdueWork, metrics.overdueWork ? `${metrics.overdueTasks} tasks · ${metrics.overdueActions} actions` : 'Everything is on track', '#d94a52', '#fff0f1', '<path d="M12 8v5m0 3h.01M10.3 4.7 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z"/>')}
      </div>
      <div class="dashboard-layout">
        <section class="section-card">
          <div class="section-head"><div><h2>Active projects</h2><p>Your portfolio at a glance</p></div><a class="text-button" href="#projects">View all <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></a></div>
          ${activeProjects.length ? `<div class="project-list">${activeProjects.map(projectRow).join('')}</div>` : emptyState('folder', 'No projects yet', 'Create your first project to begin planning and tracking your work.', 'Create project', 'new-project')}
        </section>
        <aside class="section-card">
          ${upcoming.length ? `<div class="section-head"><div><h2>Upcoming work</h2><p>Nearest task and action deadlines</p></div></div><div class="attention-list">${upcoming.map(item => {
            const project = state.projects.find(entry => entry.id === item.projectId);
            const overdue = item.type === 'Task' ? isTaskOverdue(item.task) : isActionOverdue(item.action);
            return `<a class="attention-item" href="${item.projectId ? `#projects/${encodeURIComponent(item.projectId)}` : '#projects'}"><div><strong>${escapeHtml(item.title)}</strong><span><b class="work-type">${item.type}</b>${escapeHtml(project?.name || 'Unknown project')}${item.task && item.type === 'Action' ? ` · ${escapeHtml(item.task.title)}` : ''}</span></div><span class="${overdue ? 'due-tag' : ''}">${relativeDue(item.date)}</span></a>`;
          }).join('')}</div>` : `<div class="quick-start"><div class="icon-box"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div><h2>Start building your portfolio</h2><p>Create a project, add the work that matters, and PMOptimal will keep your dashboard up to date.</p><button class="primary-button" data-action="new-project">Create a project</button></div>`}
        </aside>
      </div>
    </div>`;
}

function metricCard(label, value, foot, color, soft, icon) {
  return `<article class="metric-card" style="--metric-color:${color};--metric-soft:${soft}"><div class="metric-top"><span>${label}</span><span class="metric-icon"><svg aria-hidden="true" viewBox="0 0 24 24">${icon}</svg></span></div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></article>`;
}

function projectRow(project) {
  const [color, background] = colorForId(project.id);
  const progress = projectProgress(project.id);
  const tasks = tasksForProject(project.id);
  return `<a class="project-row" href="#projects/${encodeURIComponent(project.id)}">
    <div class="project-main"><span class="project-initial" style="--initial-color:${color};--initial-bg:${background}">${escapeHtml(projectInitial(project))}</span><div><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.description || `${tasks.length} task${tasks.length === 1 ? '' : 's'}`)}</span></div></div>
    <div class="owner-cell"><span class="avatar">${escapeHtml(initials(project.owner))}</span>${escapeHtml(project.owner || 'Unassigned')}</div>
    <span class="status-badge status-${project.status}">${labelFor(project.status)}</span>
    <div class="progress-cell"><div class="progress-meta"><span>${tasks.length} task${tasks.length === 1 ? '' : 's'}</span><strong>${progress}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>
    <span class="row-arrow"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span>
  </a>`;
}

function renderProjects() {
  app.innerHTML = `
    <div class="page-wrap">
      <div class="page-header"><div><span class="eyebrow">Portfolio</span><h1>Projects</h1><p class="page-subtitle">Keep every initiative organized, visible, and moving forward.</p></div><button class="primary-button" data-action="new-project"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>New project</button></div>
      <div class="projects-toolbar"><span class="project-count"><strong>${state.projects.length}</strong> project${state.projects.length === 1 ? '' : 's'} in your workspace</span></div>
      ${state.projects.length ? `<div class="project-grid">${state.projects.map(projectCard).join('')}</div>` : `<section class="section-card">${emptyState('folder', 'Create your first project', 'Bring your plans into one clear workspace. Add a project, then break the work into manageable tasks.', 'Create project', 'new-project')}</section>`}
    </div>`;
}

function projectCard(project) {
  const [color, background] = colorForId(project.id);
  const progress = projectProgress(project.id);
  const tasks = tasksForProject(project.id);
  return `<article class="project-card">
    <div class="project-card-top"><span class="project-initial" style="--initial-color:${color};--initial-bg:${background}">${escapeHtml(projectInitial(project))}</span><div class="card-menu"><button class="icon-button" data-action="toggle-menu" aria-label="Project actions" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 7h.01M12 12h.01M12 17h.01"/></svg></button><div class="menu-popover"><button data-action="edit-project" data-id="${project.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/></svg>Edit</button><button class="delete" data-action="delete-project" data-id="${project.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>Delete</button></div></div></div>
    <h2><a href="#projects/${encodeURIComponent(project.id)}">${escapeHtml(project.name)}</a></h2><p>${escapeHtml(project.description || 'No description added yet.')}</p>
    <div class="card-meta"><span class="status-badge status-${project.status}">${labelFor(project.status)}</span><span class="card-date">${project.targetDate ? `Target ${formatDate(project.targetDate)}` : 'No target date'}</span></div>
    <div class="card-progress"><div class="progress-meta"><span>${tasks.length} task${tasks.length === 1 ? '' : 's'}</span><strong>${progress}% complete</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>
  </article>`;
}

function renderProjectDetail(project) {
  const [color, background] = colorForId(project.id);
  const tasks = tasksForProject(project.id);
  const progress = projectProgress(project.id);
  const selectedTask = tasks.find(task => task.id === state.selectedTaskId) || tasks[0] || null;
  state.selectedTaskId = selectedTask?.id || null;
  const actionItems = selectedTask ? actionsForTask(selectedTask.id) : [];
  const openActions = actionItems.filter(action => action.status !== 'completed').length;
  app.innerHTML = `
    <div class="page-wrap">
      <div class="breadcrumb"><a href="#projects">Projects</a><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg><span>${escapeHtml(project.name)}</span></div>
      <section class="project-hero">
        <div class="project-hero-main"><span class="project-initial" style="--initial-color:${color};--initial-bg:${background}">${escapeHtml(projectInitial(project))}</span><div><span class="eyebrow">Project workspace</span><h1>${escapeHtml(project.name)}</h1><div class="hero-meta"><span class="status-badge status-${project.status}">${labelFor(project.status)}</span><span>${escapeHtml(project.owner || 'Unassigned')}</span><span>•</span><span>${progress}% complete</span></div></div></div>
        <div class="hero-actions"><button class="secondary-button" data-action="edit-project" data-id="${project.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/></svg>Edit</button><button class="primary-button" data-action="new-task" data-project-id="${project.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Add task</button></div>
      </section>
      <div class="detail-grid">
        <div class="project-workspace">
          <section class="section-card">
            <div class="section-head"><div><h2>Project plan</h2><p>${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${tasks.filter(task => task.status === 'completed').length} completed</p></div><button class="text-button" data-action="new-task" data-project-id="${project.id}">Add task <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></div>
            ${tasks.length ? taskTable(tasks, selectedTask?.id) : emptyState('task', 'No tasks in this project', 'Add the first task to turn this project into an actionable plan.', 'Add first task', 'new-task', project.id)}
          </section>
          ${selectedTask ? `<section class="section-card action-section">
            <div class="section-head"><div><span class="eyebrow">Selected task</span><h2>${escapeHtml(selectedTask.title)}</h2><p>${actionItems.length} action item${actionItems.length === 1 ? '' : 's'} · ${openActions} open</p></div><button class="primary-button small-button" data-action="new-action" data-task-id="${selectedTask.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Add action</button></div>
            ${actionItems.length ? actionTable(actionItems) : emptyState('action', 'No action items for this task', 'Capture follow-ups, owners, due dates, and notes without leaving the task.', 'Add action item', 'new-action', selectedTask.id)}
          </section>` : ''}
        </div>
        <aside class="detail-sidebar">
          <section class="section-card info-card"><h2>Project details</h2><div class="info-list"><div class="info-item"><span>Owner</span><strong>${escapeHtml(project.owner || 'Unassigned')}</strong></div><div class="info-item"><span>Priority</span><strong>${labelFor(project.priority)}</strong></div><div class="info-item"><span>Target date</span><strong>${formatDate(project.targetDate)}</strong></div><div class="info-item"><span>Progress</span><strong>${progress}%</strong></div></div></section>
          <section class="section-card info-card"><h2>About</h2><p class="description-text">${escapeHtml(project.description || 'No project description has been added yet.')}</p></section>
          <button class="secondary-button" data-action="delete-project" data-id="${project.id}">Delete project</button>
        </aside>
      </div>
    </div>`;
}

function taskTable(tasks, selectedTaskId) {
  return `<div class="table-scroll"><table class="tasks-table"><thead><tr><th>Task</th><th>Owner</th><th>Status</th><th>Priority</th><th>Start</th><th>End</th><th></th></tr></thead><tbody>${tasks.map(task => `<tr class="selectable-row ${task.id === selectedTaskId ? 'selected-row' : ''}" data-action="select-task" data-id="${task.id}" tabindex="0" aria-label="Show action items for ${escapeHtml(task.title)}">
    <td><div class="task-title"><strong>${escapeHtml(task.title)}</strong><span>${actionsForTask(task.id).length} action item${actionsForTask(task.id).length === 1 ? '' : 's'}</span></div></td>
    <td data-label="Owner">${escapeHtml(task.owner || 'Unassigned')}</td>
    <td data-label="Status"><span class="status-badge status-${task.status}">${labelFor(task.status)}</span></td>
    <td data-label="Priority"><span class="priority-badge priority-${task.priority}">${labelFor(task.priority)}</span></td>
    <td data-label="Start">${task.startDate ? formatDate(task.startDate) : '—'}</td>
    <td data-label="End">${taskEndDate(task) ? `<span class="${isTaskOverdue(task) ? 'due-tag' : ''}">${formatDate(taskEndDate(task))}</span>` : '—'}</td>
    <td><div class="task-actions"><button class="icon-button" data-action="toggle-menu" aria-label="Task actions" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 7h.01M12 12h.01M12 17h.01"/></svg></button><div class="menu-popover"><button data-action="edit-task" data-id="${task.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/></svg>Edit</button><button class="delete" data-action="delete-task" data-id="${task.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>Delete</button></div></div></td>
  </tr>`).join('')}</tbody></table></div>`;
}

function actionTable(actionItems) {
  return `<div class="action-list">${actionItems.map(action => `<article class="action-item ${isActionOverdue(action) ? 'action-overdue' : ''}">
    <div class="action-status-dot" aria-hidden="true"></div>
    <div class="action-copy"><div class="action-heading"><strong>${escapeHtml(action.title)}</strong><span class="status-badge status-${action.status}">${labelFor(action.status)}</span></div>${action.notes ? `<p>${escapeHtml(action.notes)}</p>` : ''}<div class="action-meta"><span><b>Owner</b> ${escapeHtml(action.owner || 'Unassigned')}</span><span><b>Due</b> <span class="${isActionOverdue(action) ? 'due-tag' : ''}">${formatDate(action.dueDate)}</span></span>${isActionOverdue(action) ? '<span class="overdue-label">Overdue</span>' : ''}</div></div>
    <div class="task-actions"><button class="icon-button" data-action="toggle-menu" aria-label="Action item actions" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 7h.01M12 12h.01M12 17h.01"/></svg></button><div class="menu-popover"><button data-action="edit-action" data-id="${action.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/></svg>Edit</button><button class="delete" data-action="delete-action" data-id="${action.id}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>Delete</button></div></div>
  </article>`).join('')}</div>`;
}

function emptyState(type, title, description, buttonLabel, action, projectId = '') {
  const icon = ['task', 'action'].includes(type) ? '<path d="M9 11h8M9 15h6M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>' : '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4l2 2H18.5A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-12Z"/>';
  return `<div class="empty-state"><div class="empty-state-icon"><svg aria-hidden="true" viewBox="0 0 24 24">${icon}</svg></div><h2>${title}</h2><p>${description}</p><button class="primary-button" data-action="${action}" ${projectId ? (type === 'action' ? `data-task-id="${projectId}"` : `data-project-id="${projectId}"`) : ''}>${buttonLabel}</button></div>`;
}

function openProjectForm(projectId = null) {
  projectForm.reset();
  clearFormErrors(projectForm);
  const project = state.projects.find(item => item.id === projectId);
  document.querySelector('#project-id').value = project?.id || '';
  document.querySelector('#project-name').value = project?.name || '';
  document.querySelector('#project-status').value = project?.status || 'active';
  document.querySelector('#project-priority').value = project?.priority || 'medium';
  document.querySelector('#project-owner').value = project?.owner || '';
  document.querySelector('#project-target-date').value = project?.targetDate || '';
  document.querySelector('#project-description').value = project?.description || '';
  document.querySelector('#project-dialog-title').textContent = project ? 'Edit project' : 'Create a project';
  document.querySelector('#project-submit').textContent = project ? 'Save changes' : 'Create project';
  projectDialog.showModal();
  document.querySelector('#project-name').focus();
}

function openTaskForm(projectId, taskId = null) {
  taskForm.reset();
  clearFormErrors(taskForm);
  const task = state.tasks.find(item => item.id === taskId);
  document.querySelector('#task-id').value = task?.id || '';
  document.querySelector('#task-project-id').value = task?.projectId || projectId;
  document.querySelector('#task-title').value = task?.title || '';
  document.querySelector('#task-status').value = task?.status || 'not-started';
  document.querySelector('#task-priority').value = task?.priority || 'medium';
  document.querySelector('#task-owner').value = task?.owner || '';
  document.querySelector('#task-start-date').value = task?.startDate || '';
  document.querySelector('#task-end-date').value = task ? taskEndDate(task) : '';
  document.querySelector('#task-dialog-title').textContent = task ? 'Edit task' : 'Add a task';
  document.querySelector('#task-submit').textContent = task ? 'Save changes' : 'Add task';
  taskDialog.showModal();
  document.querySelector('#task-title').focus();
}

function openActionForm(taskId, actionId = null) {
  actionForm.reset();
  clearFormErrors(actionForm);
  const action = state.actionItems.find(item => item.id === actionId);
  document.querySelector('#action-id').value = action?.id || '';
  document.querySelector('#action-task-id').value = action?.taskId || taskId;
  document.querySelector('#action-title').value = action?.title || '';
  document.querySelector('#action-owner').value = action?.owner || '';
  document.querySelector('#action-due-date').value = action?.dueDate || '';
  document.querySelector('#action-status').value = action?.status || 'open';
  document.querySelector('#action-notes').value = action?.notes || '';
  document.querySelector('#action-dialog-title').textContent = action ? 'Edit action item' : 'Add an action item';
  document.querySelector('#action-submit').textContent = action ? 'Save changes' : 'Add action item';
  actionDialog.showModal();
  document.querySelector('#action-title').focus();
}

function clearFormErrors(form) {
  form.querySelectorAll('.field').forEach(field => field.classList.remove('invalid'));
  form.querySelectorAll('.field-error').forEach(error => { error.textContent = ''; });
}

function validateRequired(input, message) {
  const field = input.closest('.field');
  const error = field.querySelector('.field-error');
  const valid = Boolean(input.value.trim());
  field.classList.toggle('invalid', !valid);
  if (error) error.textContent = valid ? '' : message;
  return valid;
}

projectForm.addEventListener('submit', event => {
  event.preventDefault();
  const nameInput = document.querySelector('#project-name');
  if (!validateRequired(nameInput, 'Enter a project name.')) return;

  const id = document.querySelector('#project-id').value;
  const existing = state.projects.find(project => project.id === id);
  const now = new Date().toISOString();
  const project = {
    id: existing?.id || createId('project'),
    name: nameInput.value.trim(),
    status: document.querySelector('#project-status').value,
    priority: document.querySelector('#project-priority').value,
    owner: document.querySelector('#project-owner').value.trim(),
    targetDate: document.querySelector('#project-target-date').value,
    description: document.querySelector('#project-description').value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    state.projects = state.projects.map(item => item.id === id ? project : item);
  } else {
    state.projects.unshift(project);
    state.selectedProjectId = project.id;
  }
  saveState(existing ? 'Project updated' : 'Project created');
  projectDialog.close();
  location.hash = `#projects/${encodeURIComponent(project.id)}`;
  render();
});

projectForm.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    projectForm.requestSubmit(document.querySelector('#project-submit'));
  }
});

taskForm.addEventListener('submit', event => {
  event.preventDefault();
  const titleInput = document.querySelector('#task-title');
  if (!validateRequired(titleInput, 'Enter a task name.')) return;
  const startDate = document.querySelector('#task-start-date').value;
  const endDateInput = document.querySelector('#task-end-date');
  const endDate = endDateInput.value;
  if (startDate && endDate && endDate < startDate) {
    const field = endDateInput.closest('.field');
    field.classList.add('invalid');
    field.querySelector('.field-error').textContent = 'End date must be on or after the start date.';
    return;
  }

  const id = document.querySelector('#task-id').value;
  const existing = state.tasks.find(task => task.id === id);
  const now = new Date().toISOString();
  const task = {
    id: existing?.id || createId('task'),
    projectId: document.querySelector('#task-project-id').value,
    title: titleInput.value.trim(),
    status: document.querySelector('#task-status').value,
    priority: document.querySelector('#task-priority').value,
    owner: document.querySelector('#task-owner').value.trim(),
    startDate: document.querySelector('#task-start-date').value,
    endDate: document.querySelector('#task-end-date').value,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  state.tasks = existing ? state.tasks.map(item => item.id === id ? task : item) : [...state.tasks, task];
  state.selectedTaskId = task.id;
  saveState(existing ? 'Task updated' : 'Task added');
  taskDialog.close();
  render();
});

taskForm.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    taskForm.requestSubmit(document.querySelector('#task-submit'));
  }
});

actionForm.addEventListener('submit', event => {
  event.preventDefault();
  const titleInput = document.querySelector('#action-title');
  if (!validateRequired(titleInput, 'Enter an action item.')) return;

  const id = document.querySelector('#action-id').value;
  const existing = state.actionItems.find(action => action.id === id);
  const now = new Date().toISOString();
  const action = {
    id: existing?.id || createId('action'),
    taskId: document.querySelector('#action-task-id').value,
    title: titleInput.value.trim(),
    owner: document.querySelector('#action-owner').value.trim(),
    dueDate: document.querySelector('#action-due-date').value,
    status: document.querySelector('#action-status').value,
    notes: document.querySelector('#action-notes').value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  state.actionItems = existing ? state.actionItems.map(item => item.id === id ? action : item) : [...state.actionItems, action];
  state.selectedTaskId = action.taskId;
  saveState(existing ? 'Action item updated' : 'Action item added');
  actionDialog.close();
  render();
});

actionForm.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'BUTTON') {
    event.preventDefault();
    actionForm.requestSubmit(document.querySelector('#action-submit'));
  }
});

function requestConfirmation(title, message, callback) {
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-message').textContent = message;
  confirmCallback = callback;
  confirmDialog.showModal();
}

confirmDialog.addEventListener('close', () => {
  if (confirmDialog.returnValue === 'confirm' && confirmCallback) confirmCallback();
  confirmCallback = null;
});

function deleteProject(projectId) {
  const project = state.projects.find(item => item.id === projectId);
  if (!project) return;
  requestConfirmation('Delete this project?', `“${project.name}”, its tasks, and linked action items will be permanently deleted.`, () => {
    const taskIds = new Set(state.tasks.filter(task => task.projectId === projectId).map(task => task.id));
    state.projects = state.projects.filter(item => item.id !== projectId);
    state.tasks = state.tasks.filter(task => task.projectId !== projectId);
    state.actionItems = state.actionItems.filter(action => !taskIds.has(action.taskId));
    if (state.selectedProjectId === projectId) state.selectedProjectId = null;
    saveState('Project deleted');
    location.hash = '#projects';
    render();
  });
}

function deleteTask(taskId) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  requestConfirmation('Delete this task?', `“${task.title}” and its linked action items will be permanently removed from the project.`, () => {
    state.tasks = state.tasks.filter(item => item.id !== taskId);
    state.actionItems = state.actionItems.filter(action => action.taskId !== taskId);
    if (state.selectedTaskId === taskId) state.selectedTaskId = null;
    saveState('Task deleted');
    render();
  });
}

function deleteAction(actionId) {
  const action = state.actionItems.find(item => item.id === actionId);
  if (!action) return;
  requestConfirmation('Delete this action item?', `“${action.title}” will be permanently removed.`, () => {
    state.actionItems = state.actionItems.filter(item => item.id !== actionId);
    saveState('Action item deleted');
    render();
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

document.addEventListener('click', event => {
  const closeTarget = event.target.closest('[data-close-dialog]');
  if (closeTarget) {
    closeTarget.closest('dialog')?.close();
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  const clickedInsideMenu = event.target.closest('.card-menu, .task-actions');
  if (!clickedInsideMenu) document.querySelectorAll('.menu-popover.open').forEach(menu => menu.classList.remove('open'));
  if (!actionTarget) return;

  const { action, id, projectId, taskId } = actionTarget.dataset;
  if (action === 'new-project') openProjectForm();
  if (action === 'edit-project') {
    event.preventDefault();
    event.stopPropagation();
    openProjectForm(id);
  }
  if (action === 'delete-project') {
    event.preventDefault();
    event.stopPropagation();
    deleteProject(id);
  }
  if (action === 'new-task') openTaskForm(projectId);
  if (action === 'select-task') {
    state.selectedTaskId = id;
    render();
  }
  if (action === 'edit-task') {
    event.stopPropagation();
    const task = state.tasks.find(item => item.id === id);
    if (task) openTaskForm(task.projectId, task.id);
  }
  if (action === 'delete-task') {
    event.stopPropagation();
    deleteTask(id);
  }
  if (action === 'new-action') openActionForm(taskId);
  if (action === 'edit-action') {
    event.stopPropagation();
    const item = state.actionItems.find(entry => entry.id === id);
    if (item) openActionForm(item.taskId, item.id);
  }
  if (action === 'delete-action') {
    event.stopPropagation();
    deleteAction(id);
  }
  if (action === 'toggle-menu') {
    event.preventDefault();
    event.stopPropagation();
    const menu = actionTarget.nextElementSibling;
    const wasOpen = menu.classList.contains('open');
    document.querySelectorAll('.menu-popover.open').forEach(item => item.classList.remove('open'));
    menu.classList.toggle('open', !wasOpen);
    actionTarget.setAttribute('aria-expanded', String(!wasOpen));
  }
});

document.addEventListener('keydown', event => {
  const row = event.target.closest('[data-action="select-task"]');
  if (row && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    state.selectedTaskId = row.dataset.id;
    render();
  }
});

document.querySelector('#mobile-menu').addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('open');
  document.querySelector('#mobile-menu').setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
});

window.addEventListener('hashchange', render);
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) {
    state = loadState();
    render();
    showToast('Workspace updated in another tab');
  }
});

render();
