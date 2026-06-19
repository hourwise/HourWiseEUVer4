import { supabase } from './supabase';
import type { Database } from './database.types';

type Invite = Database['public']['Tables']['driver_invites']['Row'];

export type InviteVerificationResult =
  | { ok: true; invite: Invite }
  | {
      ok: false;
      reason: 'empty' | 'missing' | 'expired' | 'already_used' | 'not_pending' | 'error';
      title?: string;
      message: string;
      guidance?: string;
      expiresAt?: string;
      status?: string;
    };

type InviteFunctionFailure = Extract<InviteVerificationResult, { ok: false }>;

const getInviteFromLookupResponse = (data: any): Invite | null => {
  if (!data) return null;
  if (data.invite) return data.invite as Invite;
  if (data.data?.invite) return data.data.invite as Invite;
  if (data.data?.id || data.data?.invite_code) return data.data as Invite;
  if (data.id || data.invite_code) return data as Invite;
  return null;
};

const getFailureFromLookupResponse = (data: any): Partial<InviteFunctionFailure> => {
  if (!data || typeof data !== 'object') return {};

  const detail = data.error && typeof data.error === 'object' ? data.error : data;
  return {
    reason: detail.reason,
    title: detail.title,
    message: detail.message ?? (typeof data.error === 'string' ? data.error : undefined),
    guidance: detail.guidance,
    expiresAt: detail.expiresAt ?? detail.expires_at,
    status: detail.status,
  };
};

/**
 * Verifies a driver invite code and fetches the pre-filled data.
 * @param inviteCode The 8-character code entered by the driver.
 * @returns A structured verification result with diagnostics for the UI.
 */
export const verifyInviteCode = async (inviteCode: string) => {
  const trimmedInviteCode = inviteCode.trim();
  if (!trimmedInviteCode) {
    return {
      ok: false,
      reason: 'empty',
      title: 'Invite code required',
      message: 'Invite code is empty.',
      guidance: 'Enter the code exactly as it appears in the invite email or portal.',
    } satisfies InviteVerificationResult;
  }

  try {
    const { data, error } = await supabase.functions.invoke('lookup-driver-invite', {
      body: { inviteCode: trimmedInviteCode },
    });

    if (error) {
      console.warn('Error verifying invite code:', error.message, {
        attemptedCode: trimmedInviteCode,
      });
      return {
        ok: false,
        reason: 'error',
        title: 'Invite lookup failed',
        message: `Invite lookup failed: ${error.message}`,
        guidance: 'Try again in a moment. If this keeps happening, confirm the app build matches the invite environment.',
      } satisfies InviteVerificationResult;
    }

    const invite = getInviteFromLookupResponse(data);

    if (!invite) {
      const failure = getFailureFromLookupResponse(data);
      return {
        ok: false,
        reason: failure.reason ?? 'missing',
        title: failure.title ?? 'Invite not found',
        message: failure.message ?? 'Invite code was not found in this environment.',
        guidance: failure.guidance ?? 'Check the code for typos and confirm the invite was created in the same test or live environment as this app build.',
        expiresAt: failure.expiresAt,
        status: failure.status,
      } satisfies InviteVerificationResult;
    }

    const expiresAt = new Date(invite.expires_at);
    const now = new Date();

    if (Number.isNaN(expiresAt.getTime())) {
      console.warn('Invite code has invalid expires_at value:', invite.expires_at);
      return {
        ok: false,
        reason: 'error',
        title: 'Invite data invalid',
        message: 'Invite expiry could not be read.',
        guidance: 'The invite record is malformed. Ask the fleet admin to generate a new invite.',
        expiresAt: invite.expires_at,
        status: invite.status,
      } satisfies InviteVerificationResult;
    }

    if (invite.status === 'accepted') {
      return {
        ok: false,
        reason: 'already_used',
        title: 'Invite already used',
        message: 'This invite has already been accepted.',
        guidance: 'Ask the fleet admin to create a new invite if this driver still needs access.',
        expiresAt: invite.expires_at,
        status: invite.status,
      } satisfies InviteVerificationResult;
    }

    if (invite.status !== 'pending') {
      return {
        ok: false,
        reason: 'not_pending',
        title: 'Invite not active',
        message: `Invite is ${invite.status}, not pending.`,
        guidance: 'Ask the fleet admin to check the invite status or send a replacement invite.',
        expiresAt: invite.expires_at,
        status: invite.status,
      } satisfies InviteVerificationResult;
    }

    if (expiresAt.getTime() < now.getTime()) {
      return {
        ok: false,
        reason: 'expired',
        title: 'Invite expired',
        message: 'Invite code has expired.',
        guidance: 'Ask the fleet admin to send a new invite.',
        expiresAt: invite.expires_at,
        status: invite.status,
      } satisfies InviteVerificationResult;
    }

    return { ok: true, invite } satisfies InviteVerificationResult;
  } catch (error) {
    console.error('An unexpected error occurred during invite verification:', error);
    return {
      ok: false,
      reason: 'error',
      title: 'Invite verification error',
      message: 'Unexpected invite verification error.',
      guidance: 'Try again and, if the problem persists, confirm the invite exists in the same environment as this app build.',
    } satisfies InviteVerificationResult;
  }
};

/**
 * Marks a driver invite as accepted after successful registration.
 * @param inviteCode The invite code accepted by the current signed-in user.
 */
export const acceptInvite = async (inviteCode: string) => {
  try {
    const { error } = await supabase.functions.invoke('accept-driver-invite', {
      body: { inviteCode: inviteCode.trim() },
    });

    if (error) {
      console.error('Failed to accept invite:', error.message);
      // This is not a critical failure for the user, so we just log it.
    }
  } catch (error) {
    console.error('An unexpected error occurred while accepting invite:', error);
  }
};
