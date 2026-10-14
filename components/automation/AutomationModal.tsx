'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Trash2,
  ShieldAlert,
  Sliders,
  ChevronRight,
  FileText,
  Search,
  Database,
  Layers,
  StopCircle,
  Cpu,
  Info,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { useChat } from '@/features/chat/ChatContext';
import { useAuth } from '@/features/auth/AuthContext';
import {
  AgentTask,
  TaskStep,
  WorkflowDefinition,
  ApprovalRequest,
  RiskLevel,
} from '@/types/automation';

type AutomationTab = 'workflows' | 'active' | 'history' | 'governance';

export function AutomationModal() {
  const { user } = useAuth();
  const currentUserId = user?.id || 'guest_user_default';
  const { isAutomationOpen, setIsAutomationOpen } = useChat();

  const [activeTab, setActiveTab] = useState<AutomationTab>('workflows');
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activeTask, setActiveTask] = useState<AgentTask | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);

  // Task creation state
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowInputs, setWorkflowInputs] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Load Workflows
  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/workflows?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch {
      // Graceful fallback
    }
  }, [currentUserId]);

  // Load Tasks
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/tasks?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedTasks: AgentTask[] = data.tasks || [];
        setTasks(loadedTasks);

        // Keep active task updated
        if (loadedTasks.length > 0) {
          const inProgress = loadedTasks.find((t) => t.status === 'running' || t.status === 'waiting_approval' || t.status === 'planning');
          if (inProgress) {
            setActiveTask(inProgress);
          } else if (!activeTask) {
            setActiveTask(loadedTasks[0]);
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }, [currentUserId, activeTask]);

  // Load Approvals
  const loadApprovals = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/approve?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch {
      // Graceful fallback
    }
  }, [currentUserId]);

  useEffect(() => {
    if (isAutomationOpen) {
      loadWorkflows();
      loadTasks();
      loadApprovals();
    }
  }, [isAutomationOpen, loadWorkflows, loadTasks, loadApprovals]);

  // Polling for live updates when task is running or waiting
  useEffect(() => {
    if (!isAutomationOpen || !activeTask) return;
    if (activeTask.status !== 'running' && activeTask.status !== 'planning' && activeTask.status !== 'waiting_approval') return;

    const interval = setInterval(() => {
      loadTasks();
      loadApprovals();
    }, 2500);

    return () => clearInterval(interval);
  }, [isAutomationOpen, activeTask, loadTasks, loadApprovals]);

  // Trigger Custom Task
  const handleRunCustomTask = async () => {
    if (!customPrompt.trim()) return;
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/agent/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          prompt: customPrompt.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start task.');
      }

      setActiveTask(data.task);
      setCustomPrompt('');
      setActiveTab('active');
      setStatusMessage({ text: 'Task started successfully.', type: 'success' });
      loadTasks();
    } catch (err: unknown) {
      setStatusMessage({ text: err instanceof Error ? err.message : 'Task error.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger Pre-built Workflow
  const handleRunWorkflow = async (workflowId: string) => {
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/agent/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          inputs: workflowInputs,
          userId: currentUserId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Workflow execution failed.');
      }

      setStatusMessage({ text: 'Workflow triggered successfully.', type: 'success' });
      setSelectedWorkflowId(null);
      setWorkflowInputs({});
      setActiveTab('active');
      loadTasks();
    } catch (err: unknown) {
      setStatusMessage({ text: err instanceof Error ? err.message : 'Workflow failed.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Running Task
  const handleCancelTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/agent/tasks?taskId=${taskId}&userId=${currentUserId}&action=cancel`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.task) {
        setActiveTask(data.task);
        loadTasks();
        setStatusMessage({ text: 'Task cancelled.', type: 'info' });
      }
    } catch {
      setStatusMessage({ text: 'Failed to cancel task.', type: 'error' });
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/agent/tasks?taskId=${taskId}&userId=${currentUserId}&action=delete`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (activeTask?.id === taskId) {
          setActiveTask(null);
        }
        loadTasks();
        setStatusMessage({ text: 'Task deleted from history.', type: 'info' });
      }
    } catch {
      setStatusMessage({ text: 'Failed to delete task.', type: 'error' });
    }
  };

  // Handle User Approval / Rejection
  const handleApprovalDecision = async (approvalId: string, approvalToken: string, decision: 'approve' | 'reject') => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId,
          approvalToken,
          decision,
          userId: currentUserId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process approval.');
      }

      setStatusMessage({
        text: decision === 'approve' ? 'Action approved and resumed.' : 'Action rejected.',
        type: decision === 'approve' ? 'success' : 'info',
      });

      if (data.task) {
        setActiveTask(data.task);
      }
      loadApprovals();
      loadTasks();
    } catch (err: unknown) {
      setStatusMessage({ text: err instanceof Error ? err.message : 'Approval error.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for risk badge colors
  const getRiskBadge = (level: RiskLevel) => {
    if (level === 'HIGH') {
      return <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600 }}>HIGH RISK</span>;
    }
    if (level === 'MEDIUM') {
      return <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid #f59e0b', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600 }}>CONFIRMATION REQUIRED</span>;
    }
    return <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600 }}>LOW RISK (AUTONOMOUS)</span>;
  };

  // Helper for task status badge
  const getStatusBadge = (status: AgentTask['status']) => {
    switch (status) {
      case 'completed':
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#34d399', fontWeight: 600, fontSize: '0.8rem' }}><CheckCircle2 size={14} /> Completed</span>;
      case 'running':
      case 'planning':
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#38bdf8', fontWeight: 600, fontSize: '0.8rem' }}><Cpu size={14} className="animate-spin" /> {status === 'planning' ? 'Planning...' : 'Running...'}</span>;
      case 'waiting_approval':
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#fbbf24', fontWeight: 600, fontSize: '0.8rem' }}><AlertTriangle size={14} /> Waiting Approval</span>;
      case 'failed':
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f87171', fontWeight: 600, fontSize: '0.8rem' }}><XCircle size={14} /> Failed</span>;
      case 'cancelled':
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem' }}><StopCircle size={14} /> Cancelled</span>;
      default:
        return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{status}</span>;
    }
  };

  // Active task's pending approval if any
  const pendingApproval = activeTask && activeTask.status === 'waiting_approval'
    ? approvals.find((a) => a.taskId === activeTask.id && a.status === 'pending')
    : null;

  return (
    <Modal
      isOpen={isAutomationOpen}
      onClose={() => setIsAutomationOpen(false)}
      title="Intelligent Automation & AI Agents"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '78vh', overflowY: 'auto', paddingRight: '4px' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <button
            type="button"
            className={`btn-ghost ${activeTab === 'workflows' ? 'active' : ''}`}
            onClick={() => setActiveTab('workflows')}
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              fontWeight: 600,
              borderRadius: '6px',
              background: activeTab === 'workflows' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'workflows' ? 'var(--color-primary, #6366f1)' : 'var(--text-secondary)',
            }}
          >
            <Layers size={15} style={{ marginRight: '6px' }} />
            Workflows & Tasks
          </button>

          <button
            type="button"
            className={`btn-ghost ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              fontWeight: 600,
              borderRadius: '6px',
              background: activeTab === 'active' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'active' ? 'var(--color-primary, #6366f1)' : 'var(--text-secondary)',
            }}
          >
            <Cpu size={15} style={{ marginRight: '6px' }} />
            Execution Monitor
            {activeTask && (activeTask.status === 'running' || activeTask.status === 'waiting_approval') && (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeTask.status === 'waiting_approval' ? '#f59e0b' : '#38bdf8', marginLeft: '6px', display: 'inline-block' }} />
            )}
          </button>

          <button
            type="button"
            className={`btn-ghost ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              fontWeight: 600,
              borderRadius: '6px',
              background: activeTab === 'history' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'history' ? 'var(--color-primary, #6366f1)' : 'var(--text-secondary)',
            }}
          >
            <Clock size={15} style={{ marginRight: '6px' }} />
            Task History ({tasks.length})
          </button>

          <button
            type="button"
            className={`btn-ghost ${activeTab === 'governance' ? 'active' : ''}`}
            onClick={() => setActiveTab('governance')}
            style={{
              padding: '6px 12px',
              fontSize: '0.85rem',
              fontWeight: 600,
              borderRadius: '6px',
              background: activeTab === 'governance' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'governance' ? 'var(--color-primary, #6366f1)' : 'var(--text-secondary)',
            }}
          >
            <ShieldAlert size={15} style={{ marginRight: '6px' }} />
            Security & Tools
          </button>
        </div>

        {/* Status Message Notification */}
        {statusMessage && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : statusMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
              color: statusMessage.type === 'success' ? '#34d399' : statusMessage.type === 'error' ? '#f87171' : '#38bdf8',
              border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : statusMessage.type === 'error' ? '#ef4444' : '#38bdf8'}`,
            }}
          >
            {statusMessage.text}
          </div>
        )}

        {/* TAB 1: WORKFLOWS & CUSTOM TASK */}
        {activeTab === 'workflows' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Custom Autonomous Agent Launcher */}
            <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={16} color="var(--color-primary)" /> Custom Autonomous Agent Task
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Provide a prompt. RIYAAI will reason with Gemini, compile an ordered tool plan, and execute within strict bounded safety limits.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. Search my documents for Q3 performance metrics and compile an executive report"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRunCustomTask()}
                  style={{
                    flex: 1,
                    background: 'var(--bg-input, rgba(0,0,0,0.3))',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunCustomTask}
                  disabled={isSubmitting || !customPrompt.trim()}
                >
                  <Play size={14} style={{ marginRight: '4px' }} />
                  {isSubmitting ? 'Planning...' : 'Plan & Run'}
                </Button>
              </div>
            </div>

            {/* Pre-built Workflows Gallery */}
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px' }}>
                Pre-Built Automated Workflows
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    style={{
                      background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{wf.name}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{wf.steps.length} steps</span>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {wf.description}
                      </p>
                    </div>

                    {selectedWorkflowId === wf.id ? (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {Object.entries(wf.inputSchema).map(([field, schema]) => (
                          <input
                            key={field}
                            type="text"
                            placeholder={`${field}${schema.required ? ' *' : ''} (${schema.description})`}
                            value={workflowInputs[field] || ''}
                            onChange={(e) => setWorkflowInputs({ ...workflowInputs, [field]: e.target.value })}
                            style={{
                              background: 'var(--bg-input, rgba(0,0,0,0.3))',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              padding: '5px 8px',
                              fontSize: '0.8rem',
                              color: 'var(--text-primary)',
                            }}
                          />
                        ))}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleRunWorkflow(wf.id)}
                            disabled={isSubmitting}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '0.78rem' }}
                          >
                            Execute
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedWorkflowId(null)}
                            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedWorkflowId(wf.id);
                          setWorkflowInputs({});
                        }}
                        style={{ alignSelf: 'flex-start', fontSize: '0.78rem', padding: '4px 10px' }}
                      >
                        Configure & Run <ChevronRight size={13} style={{ marginLeft: '4px' }} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE EXECUTION & APPROVAL MONITOR */}
        {activeTab === 'active' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {!activeTask ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Cpu size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <p>No active or selected task. Launch a workflow or custom task above to begin.</p>
              </div>
            ) : (
              <>
                {/* Task Header & Controls */}
                <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '1rem' }}>{activeTask.title}</span>
                      {getStatusBadge(activeTask.status)}
                    </div>

                    {(activeTask.status === 'running' || activeTask.status === 'planning' || activeTask.status === 'waiting_approval') && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleCancelTask(activeTask.id)}
                        style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                      >
                        <StopCircle size={13} style={{ marginRight: '4px' }} /> Cancel Task
                      </Button>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Prompt: &quot;{activeTask.prompt}&quot;
                  </p>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Task ID: {activeTask.id} • Created: {new Date(activeTask.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                {/* APPROVAL REQUEST BANNER / CARD */}
                {pendingApproval && (
                  <div
                    style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1.5px solid #f59e0b',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={20} color="#f59e0b" />
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fbbf24' }}>
                        Explicit User Approval Required
                      </span>
                      {getRiskBadge(pendingApproval.riskLevel)}
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      The agent requests authorization to execute protected tool: <strong>`{pendingApproval.toolName}`</strong>
                    </p>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <strong>Action:</strong> {pendingApproval.actionDescription}
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto' }}>
                      <strong>Validated Parameters:</strong>
                      <pre style={{ margin: '4px 0 0 0' }}>{JSON.stringify(pendingApproval.parameters, null, 2)}</pre>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Approval is cryptographically bound to token: <code>{pendingApproval.approvalToken.slice(0, 16)}...</code> (Expires in 15 mins)
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApprovalDecision(pendingApproval.id, pendingApproval.approvalToken, 'approve')}
                        disabled={isSubmitting}
                        style={{ background: '#10b981', borderColor: '#059669', fontSize: '0.85rem' }}
                      >
                        <CheckCircle2 size={15} style={{ marginRight: '6px' }} />
                        Approve & Execute Action
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleApprovalDecision(pendingApproval.id, pendingApproval.approvalToken, 'reject')}
                        disabled={isSubmitting}
                        style={{ fontSize: '0.85rem' }}
                      >
                        <XCircle size={15} style={{ marginRight: '6px' }} />
                        Reject Action
                      </Button>
                    </div>
                  </div>
                )}

                {/* Ordered Execution Steps Timeline */}
                <div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '8px' }}>Execution Steps</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeTask.steps.map((step, idx) => (
                      <div
                        key={step.id || idx}
                        style={{
                          background: step.status === 'running' ? 'rgba(56, 189, 248, 0.05)' : 'var(--bg-secondary, rgba(255,255,255,0.02))',
                          border: `1px solid ${step.status === 'running' ? '#38bdf8' : step.status === 'waiting_approval' ? '#f59e0b' : 'var(--border-color)'}`,
                          borderRadius: '6px',
                          padding: '10px 12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>Step {step.stepIndex + 1}: {step.title}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({step.toolName})</span>
                            {getRiskBadge(step.riskLevel)}
                          </div>
                          <div>{getStatusBadge(step.status as AgentTask['status'])}</div>
                        </div>

                        {step.error && (
                          <div style={{ marginTop: '6px', color: '#f87171', fontSize: '0.78rem' }}>
                            Error: {step.error}
                          </div>
                        )}

                        {Boolean(step.result) && (
                          <details style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <summary style={{ cursor: 'pointer', color: 'var(--color-primary)' }}>View Step Output</summary>
                            <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '4px', overflowX: 'auto', marginTop: '4px' }}>
                              {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Task Final Summary */}
                {activeTask.summary && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '14px' }}>
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#34d399', marginBottom: '6px' }}>
                      Final Task Summary
                    </h4>
                    <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-line', color: 'var(--text-primary)' }}>
                      {activeTask.summary}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 3: TASK HISTORY */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tasks.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Clock size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <p>No past task executions found.</p>
              </div>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => { setActiveTask(t); setActiveTab('active'); }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t.title}</span>
                      {getStatusBadge(t.status)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {t.steps.length} steps • {new Date(t.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setActiveTask(t); setActiveTab('active'); }}
                      style={{ fontSize: '0.78rem' }}
                    >
                      Inspect
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTask(t.id)}
                      title="Delete task history"
                      style={{ color: '#f87171' }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: GOVERNANCE & REGISTERED TOOLS */}
        {activeTab === 'governance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.82rem' }}>
            <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <h4 style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px' }}>
                Three-Tier Risk-Based Autonomy Policy
              </h4>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                <li><strong>LOW RISK</strong>: Document summarization, knowledge base searching, report drafting. Automated execution within configured timeout/step bounds.</li>
                <li><strong>MEDIUM RISK</strong>: Persistent memory creation, workflow definition updates. Requires confirmation.</li>
                <li><strong>HIGH RISK</strong>: Document deletion, data export, external communication. Strictly blocks on single-use cryptographic token approval from user.</li>
              </ul>
            </div>

            <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <h4 style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '4px' }}>
                Prompt Injection Defense & Sandbox
              </h4>
              <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                All content retrieved from uploaded files, PDFs, or previous tool outputs is quarantined inside <code>&lt;untrusted_content&gt;</code> sandboxes. Gemini is strictly instructed never to treat external document text as administrative authorizations or commands.
              </p>
            </div>

            <div style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <h4 style={{ fontWeight: 600, color: '#34d399', marginBottom: '4px' }}>
                Pretrained Neural Network Capabilities
              </h4>
              <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Powered by a high-dimensional dense embedding service and neural semantic re-ranker. Provides zero-shot intent categorization and cross-scoring of document chunks without introducing auxiliary LLMs or local runtime bloat.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
