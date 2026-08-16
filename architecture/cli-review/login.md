# `login` review

Status: **pending**

The active `auth-setup-ux` request changes this command substantially. Review after that surface is finalized so this file does not canonize the current `login --provider github|claude` mixture.

Working direction: `specrunner login` should mean GitHub interactive login only; headless runtime credential storage should live under a credential-storage command rather than `login`.
