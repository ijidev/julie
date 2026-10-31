<?php

declare(strict_types=1);

namespace Wayfairs\Services;

use Wayfairs\Core\Database;
use Wayfairs\Core\Security;

final class AuthService
{
    public function __construct(private readonly Database $database)
    {
    }

    public function register(array $input): array
    {
        $email = $this->normalizeEmail((string) ($input['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \RuntimeException('Enter a valid email address.');
        }
        if (strlen((string) ($input['password'] ?? '')) < 12) {
            throw new \RuntimeException('Password must be at least 12 characters.');
        }
        if ($this->database->fetchOne('SELECT id FROM users WHERE email_normalized = ?', [$email])) {
            throw new \RuntimeException('That email address is already registered.');
        }
        $id = Security::uuid();
        $this->database->execute(
            'INSERT INTO users (id, role, email, email_normalized, password_hash, first_name, last_name, phone, status, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $id,
                'user',
                $email,
                $email,
                Security::passwordHash((string) $input['password']),
                trim((string) ($input['first_name'] ?? '')),
                trim((string) ($input['last_name'] ?? '')),
                trim((string) ($input['phone'] ?? '')) ?: null,
                'active',
                gmdate('Y-m-d H:i:s.u'),
            ]
        );
        $this->database->execute('INSERT INTO kyc_profiles (user_id) VALUES (?)', [$id]);
        return $this->userById($id);
    }

    public function authenticate(string $email, string $password, string $ip): ?array
    {
        $user = $this->database->fetchOne('SELECT * FROM users WHERE email_normalized = ?', [$this->normalizeEmail($email)]);
        if (!$user) {
            Security::passwordHash($password);
            return null;
        }
        if ($user['status'] === 'blocked' || $user['status'] === 'closed') {
            return null;
        }
        if ($user['locked_until'] && strtotime((string) $user['locked_until']) > time()) {
            return null;
        }
        if (!password_verify($password, (string) $user['password_hash'])) {
            $attempts = (int) $user['failed_login_attempts'] + 1;
            $lockedUntil = $attempts >= 6 ? gmdate('Y-m-d H:i:s.u', time() + min(3600, 60 * (2 ** ($attempts - 5)))) : null;
            $this->database->execute('UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?', [$attempts, $lockedUntil, gmdate('Y-m-d H:i:s.u'), $user['id']]);
            return null;
        }
        $this->database->execute('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?', [gmdate('Y-m-d H:i:s.u'), gmdate('Y-m-d H:i:s.u'), $user['id']]);
        return $this->userById((string) $user['id']);
    }

    public function createSession(string $userId, ?string $originalAdminId = null, ?string $impersonationReason = null, ?string $expiresAt = null): string
    {
        $token = Security::token(48);
        $expiresAt ??= gmdate('Y-m-d H:i:s.u', time() + 720 * 60);
        $this->database->execute(
            'INSERT INTO sessions (id, user_id, token_hash, original_admin_id, impersonation_reason, impersonation_expires_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [Security::uuid(), $userId, Security::hashToken($token), $originalAdminId, $impersonationReason, $expiresAt, $expiresAt]
        );
        return $token;
    }

    public function sessionUser(string $token): ?array
    {
        $row = $this->database->fetchOne(
            "SELECT s.*, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?",
            [Security::hashToken($token), gmdate('Y-m-d H:i:s.u')]
        );
        if (!$row) {
            return null;
        }
        if (($row['original_admin_id'] ?? null) && ($row['impersonation_expires_at'] ?? null) && strtotime((string) $row['impersonation_expires_at']) <= time()) {
            $this->revoke($token);
            return null;
        }
        $this->database->execute('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', [gmdate('Y-m-d H:i:s.u'), Security::hashToken($token)]);
        return $this->sessionRowToUser($row);
    }

    public function revoke(string $token): void
    {
        $this->database->execute('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?', [gmdate('Y-m-d H:i:s.u'), Security::hashToken($token)]);
    }

    public function revokeAllForUser(string $userId): void
    {
        $this->database->execute('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [gmdate('Y-m-d H:i:s.u'), $userId]);
    }

    public function impersonate(string $adminId, string $targetUserId, string $reason, string $currentPassword): string
    {
        $admin = $this->userById($adminId);
        if (!$admin || $admin['role'] !== 'admin') {
            throw new \RuntimeException('Only administrators can impersonate users.');
        }
        if (!password_verify($currentPassword, (string) $admin['password_hash'])) {
            throw new \RuntimeException('Administrator password verification failed.');
        }
        $target = $this->userById($targetUserId);
        if (!$target || $target['status'] !== 'active') {
            throw new \RuntimeException('The requested account is not available for impersonation.');
        }
        if ($target['id'] === $adminId) {
            throw new \RuntimeException('Administrators cannot impersonate their own account.');
        }
        $reason = trim($reason);
        if (strlen($reason) < 10) {
            throw new \RuntimeException('Enter a reason of at least 10 characters.');
        }
        $expiresAt = gmdate('Y-m-d H:i:s.u', time() + 30 * 60);
        $token = $this->createSession($targetUserId, $adminId, $reason, $expiresAt);
        $this->database->execute(
            'INSERT INTO audit_events (id, actor_user_id, effective_user_id, action, resource_type, resource_id, request_id, reason, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [Security::uuid(), $adminId, $targetUserId, 'admin.impersonate.start', 'user', $targetUserId, Security::uuid(), $reason, json_encode(['expires_at' => $expiresAt], JSON_THROW_ON_ERROR)]
        );
        return $token;
    }

    public function stopImpersonation(string $token, string $requestId): void
    {
        $row = $this->database->fetchOne(
            "SELECT s.*, u.role AS effective_role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL",
            [Security::hashToken($token)]
        );
        if (!$row || empty($row['original_admin_id'])) {
            throw new \RuntimeException('There is no active impersonation session to stop.');
        }
        $this->database->execute('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?', [gmdate('Y-m-d H:i:s.u'), Security::hashToken($token)]);
        $this->database->execute(
            'INSERT INTO audit_events (id, actor_user_id, effective_user_id, action, resource_type, resource_id, request_id, reason, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [Security::uuid(), (string) $row['original_admin_id'], (string) $row['user_id'], 'admin.impersonate.stop', 'user', (string) $row['user_id'], $requestId, 'Administrator exited impersonation', '{}']
        );
    }

    /**
     * End an impersonation session and return a fresh administrator session token
     * so the operator lands back in the admin console instead of being signed out.
     */
    public function resumeAdminSession(string $token, string $requestId): string
    {
        $row = $this->database->fetchOne(
            "SELECT s.* FROM sessions s WHERE s.token_hash = ? AND s.revoked_at IS NULL",
            [Security::hashToken($token)]
        );
        if (!$row || empty($row['original_admin_id'])) {
            throw new \RuntimeException('There is no active impersonation session to stop.');
        }
        $admin = $this->userById((string) $row['original_admin_id']);
        if (!$admin || $admin['role'] !== 'admin' || $admin['status'] !== 'active') {
            throw new \RuntimeException('The originating administrator account is no longer available.');
        }
        $this->database->execute('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?', [gmdate('Y-m-d H:i:s.u'), Security::hashToken($token)]);
        $this->database->execute(
            'INSERT INTO audit_events (id, actor_user_id, effective_user_id, action, resource_type, resource_id, request_id, reason, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [Security::uuid(), (string) $admin['id'], (string) $row['user_id'], 'admin.impersonate.stop', 'user', (string) $row['user_id'], $requestId, 'Administrator exited impersonation', '{}']
        );
        return $this->createSession((string) $admin['id']);
    }

    public function userById(string $id): ?array
    {
        return $this->database->fetchOne('SELECT * FROM users WHERE id = ?', [$id]);
    }

    private function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email), 'UTF-8');
    }

    private function sessionRowToUser(array $row): array
    {
        return [
            'id' => $row['user_id'],
            'role' => $row['role'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'email' => $row['email'],
            'status' => $row['status'],
            'original_admin_id' => $row['original_admin_id'],
            'impersonation_reason' => $row['impersonation_reason'],
            'impersonation_expires_at' => $row['impersonation_expires_at'],
        ];
    }
}
