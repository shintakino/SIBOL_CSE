"""Release regressions using scoped Coolify responses; never contacts a service."""
import contextlib
import io
import os
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import release


class ReleaseTests(unittest.TestCase):
    def run_release(self, *, raw=True, superseded=False, failed=False):
        revision = 'a' * 40
        resource = 'q52xajsad67xkcmtdwjto1uu'
        mutations = []

        def api(url, method='GET', data=None, token=None):
            if url.startswith('https://api.github.com/'):
                return {'object': {'sha': 'b' * 40 if superseded else revision}}
            if method != 'GET':
                mutations.append((url, method, data))
                return {'deployments': [{'deployment_uuid': 'deployment-123'}]} if url.endswith('/deploy') else {}
            if url.endswith('/applications/' + resource):
                # Resource-scoped responses omit sensitive fields such as the
                # custom start command. No broader token should be necessary.
                return {'uuid': resource, 'build_pack': 'dockercompose', 'git_branch': 'main',
                        'git_repository': 'https://github.com/shintakino/SIBOL_CSE.git',
                        'docker_compose_location': '/docker-compose.coolify.yml',
                        'settings': {'is_raw_compose_deployment_enabled': raw}}
            if '/deployments/' in url:
                return {'status': 'failed' if failed else 'finished'}
            if '/api/health/ready' in url:
                return {'status': 'ready', 'release': revision}
            raise AssertionError('Unexpected release request')

        response = MagicMock()
        response.__enter__.return_value.status = 200
        env = {'GITHUB_SHA': revision, 'SIBOL_DEPLOY_SHA': revision, 'COOLIFY_APPLICATION_UUID': resource,
               'COOLIFY_TOKEN': 'test-only-scoped-token', 'COOLIFY_API_URL': 'https://sibol-deploy.shintakino.qzz.io/api/v1'}
        with patch.dict(os.environ, env), patch.object(release, 'request', side_effect=api), \
             patch.object(release.time, 'sleep'), patch.object(release.OPENER, 'open', return_value=response), \
             patch.object(Path, 'write_text') as receipt, contextlib.redirect_stdout(io.StringIO()):
            error = None
            try:
                release.main()
            except release.ReleaseError as caught:
                error = caught
        return mutations, receipt.called, error

    def test_scoped_response_deploys_exact_revision_without_sensitive_fields(self):
        mutations, receipt, error = self.run_release()
        self.assertIsNone(error)
        self.assertTrue(receipt)
        self.assertEqual([item[1] for item in mutations], ['PATCH', 'PATCH', 'POST'])
        runtime = mutations[0][2]['data'][0]
        self.assertEqual(runtime['value'], 'a' * 40)
        self.assertFalse(runtime['is_buildtime'])
        self.assertTrue(runtime['is_runtime'])
        self.assertEqual(mutations[1][2], {'git_commit_sha': runtime['value']})

    def test_normal_parser_is_rejected_before_any_mutation(self):
        mutations, receipt, error = self.run_release(raw=False)
        self.assertIn('Raw Compose mode', str(error))
        self.assertEqual(mutations, [])
        self.assertFalse(receipt)

    def test_superseded_main_does_not_mutate_or_deploy(self):
        mutations, receipt, error = self.run_release(superseded=True)
        self.assertIsNone(error)
        self.assertEqual(mutations, [])
        self.assertFalse(receipt)

    def test_failed_deployment_never_writes_a_success_receipt(self):
        _, receipt, error = self.run_release(failed=True)
        self.assertIn('deployment failed', str(error))
        self.assertFalse(receipt)


if __name__ == '__main__':
    unittest.main()
