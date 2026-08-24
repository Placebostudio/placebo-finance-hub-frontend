import { STORAGE_KEYS } from '../lib/constants';
import { getItems } from '../lib/data/storage';
import { userRepository } from './backend-users';

let permission = null;

const ROLE_PERMISSIONS = {
    viewer: 0,
    manager: 1,
    owner: 2
};

function setPermission(user) {
    if (!user) {
        permission = null;
        return;
    }

    permission = ROLE_PERMISSIONS[user.role] ?? 0;
}

function getPermission() {
    return permission;
}

function initializePermission() {
    const user = userRepository.getLoggedInUser();

    setPermission(user);
}

function canViewAdministration() {
    initializePermission();
    return getPermission() >= 1; // admin (Manager) or owner
}

function canManageUsers() {
    initializePermission();
    return getPermission() >= 2; // owner only
}

function canViewAuditLog() {
    initializePermission();
    return getPermission() >= 1; // admin (Manager) or owner
}

function canViewSpam() {
    initializePermission();
    return getPermission() >= 2; // owner only
}

export { initializePermission, setPermission, getPermission, canViewAdministration, canManageUsers, canViewAuditLog, canViewSpam };