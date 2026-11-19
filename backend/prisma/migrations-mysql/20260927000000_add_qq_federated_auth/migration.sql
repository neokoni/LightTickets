ALTER TABLE `federated_auth_providers`
    MODIFY `protocol` ENUM('oidc', 'oauth', 'qq') NOT NULL;
