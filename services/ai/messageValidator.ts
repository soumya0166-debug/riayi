import { Message } from '@/types/message';
import { ValidationError } from '@/lib/errors';
import { AI_CONFIG } from '@/config/ai';

export interface MessageDiagnostic {
  index: number;
  role: string;
  contentLength: number;
  hasAttachments: boolean;
  action: 'kept' | 'filtered_empty_assistant' | 'filtered_invalid' | 'rejected';
  reason?: string;
}

export interface NormalizationResult {
  messages: Message[];
  diagnostics: MessageDiagnostic[];
}

/**
 * Safe structured diagnostic logging.
 * Never logs raw message text, user prompts, or secrets.
 */
export function logValidationDiagnostics(
  provider: string,
  diagnostics: MessageDiagnostic[]
): void {
  const kept = diagnostics.filter((d) => d.action === 'kept').length;
  const filtered = diagnostics.filter((d) => d.action !== 'kept').length;

  console.log(
    `[RIYAI MessageValidator] Provider: ${provider} | Input count: ${diagnostics.length} | Kept: ${kept} | Filtered: ${filtered}`
  );

  // If any messages were filtered, log safe diagnostic breakdown
  if (filtered > 0) {
    const droppedDetails = diagnostics
      .filter((d) => d.action !== 'kept')
      .map((d) => `index ${d.index} (${d.role}, action=${d.action}, reason="${d.reason || ''}")`)
      .join(', ');
    console.log(`[RIYAI MessageValidator] Filtered items: [${droppedDetails}]`);
  }
}

/**
 * Shared message validation and normalization layer.
 *
 * Rules:
 * 1. Requires a non-empty array of message objects.
 * 2. Safely handles null, undefined, empty strings, and malformed objects.
 * 3. In conversation history, empty assistant placeholders or failed turns with empty content
 *    are safely filtered out rather than failing the request.
 * 4. The active turn (last user message) MUST have non-empty textual content or a valid attachment.
 * 5. Guarantees that every message passed downstream has valid roles and non-empty content / multimodal data.
 */
export function normalizeAndValidateMessages(
  rawMessages: unknown,
  provider = 'unknown'
): Message[] {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new ValidationError('A non-empty messages array is required.');
  }

  const validRoles = new Set(['user', 'assistant', 'system']);
  const diagnostics: MessageDiagnostic[] = [];
  const validMessages: Message[] = [];

  for (let i = 0; i < rawMessages.length; i++) {
    const raw = rawMessages[i];

    // Check for null / non-object
    if (!raw || typeof raw !== 'object') {
      diagnostics.push({
        index: i,
        role: 'unknown',
        contentLength: 0,
        hasAttachments: false,
        action: 'filtered_invalid',
        reason: 'Message entry is null or not an object',
      });
      continue;
    }

    const role = (raw as Record<string, unknown>).role;
    if (typeof role !== 'string' || !validRoles.has(role)) {
      diagnostics.push({
        index: i,
        role: String(role || 'missing'),
        contentLength: 0,
        hasAttachments: false,
        action: 'filtered_invalid',
        reason: `Invalid or missing role: '${role}'. Allowed: user, assistant, system.`,
      });
      continue;
    }

    const rawContent = (raw as Record<string, unknown>).content;
    const attachments = (raw as Record<string, unknown>).attachments;
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    let contentStr = '';
    if (typeof rawContent === 'string') {
      contentStr = rawContent.trim();
    } else if (rawContent !== null && rawContent !== undefined) {
      contentStr = String(rawContent).trim();
    }

    // Check if attachments can supply content fallback
    if (contentStr.length === 0 && hasAttachments) {
      const names = (attachments as Array<{ name?: string }>)
        .map((a) => a.name || 'file')
        .join(', ');
      contentStr = `[Attached files: ${names}]`;
    }

    const isLastMessage = i === rawMessages.length - 1;

    // Rule: Empty assistant message in history
    if (role === 'assistant' && contentStr.length === 0) {
      diagnostics.push({
        index: i,
        role,
        contentLength: 0,
        hasAttachments,
        action: 'filtered_empty_assistant',
        reason: 'Empty assistant placeholder or failed response turn removed from history',
      });
      continue;
    }

    // Rule: User message validation
    if (role === 'user' && contentStr.length === 0 && !hasAttachments) {
      if (isLastMessage) {
        // Active submission cannot be empty
        diagnostics.push({
          index: i,
          role,
          contentLength: 0,
          hasAttachments: false,
          action: 'rejected',
          reason: 'Active user submission has empty content with no attachments',
        });
        logValidationDiagnostics(provider, diagnostics);
        throw new ValidationError(
          'Your message cannot be empty. Please enter text or attach a supported file.'
        );
      } else {
        // Historical empty user message without attachments
        diagnostics.push({
          index: i,
          role,
          contentLength: 0,
          hasAttachments: false,
          action: 'filtered_invalid',
          reason: 'Empty user message in history without attachments removed',
        });
        continue;
      }
    }

    // Rule: System message validation
    if (role === 'system' && contentStr.length === 0) {
      diagnostics.push({
        index: i,
        role,
        contentLength: 0,
        hasAttachments: false,
        action: 'filtered_invalid',
        reason: 'Empty system message in history removed',
      });
      continue;
    }

    // Check max character length
    if (contentStr.length > AI_CONFIG.maxMessageContentLength) {
      diagnostics.push({
        index: i,
        role,
        contentLength: contentStr.length,
        hasAttachments,
        action: 'rejected',
        reason: `Exceeds max allowed length of ${AI_CONFIG.maxMessageContentLength}`,
      });
      logValidationDiagnostics(provider, diagnostics);
      throw new ValidationError(
        `Message at index ${i} exceeds maximum allowed length of ${AI_CONFIG.maxMessageContentLength} characters.`
      );
    }

    // Valid message to keep
    const cleanMsg: Message = {
      ...(raw as Message),
      role: role as 'user' | 'assistant' | 'system',
      content: contentStr,
    };

    validMessages.push(cleanMsg);
    diagnostics.push({
      index: i,
      role,
      contentLength: contentStr.length,
      hasAttachments,
      action: 'kept',
    });
  }

  // Final check: Must have at least 1 valid user message
  const hasUserMessage = validMessages.some((m) => m.role === 'user');
  if (!hasUserMessage) {
    logValidationDiagnostics(provider, diagnostics);
    throw new ValidationError('A valid non-empty user message is required.');
  }

  logValidationDiagnostics(provider, diagnostics);
  return validMessages;
}
