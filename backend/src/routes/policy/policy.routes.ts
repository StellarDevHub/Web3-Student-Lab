import { Router, Request, Response } from 'express';
import { PolicyEngine } from '../../services/policy/PolicyEngine.js';
import { VulnerabilityScanner } from '../../services/vulnerabilityScanner.service.js';
import logger from '../../utils/logger.js';

const router: Router = Router();
const policyEngine = PolicyEngine.getInstance();
const vulnerabilityScanner = VulnerabilityScanner.getInstance();

/**
 * @route GET /api/v1/policy/version
 * @desc Get current policy system version and metadata
 */
router.get('/version', (_req: Request, res: Response) => {
  try {
    const enabledPolicies = policyEngine.getEnabledPolicies();
    const allPolicies = policyEngine.getAllPolicies();
    
    res.json({
      status: 'success',
      data: {
        systemVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        policies: {
          total: allPolicies.length,
          enabled: enabledPolicies.length,
          available: allPolicies.map(policy => ({
            id: policy.id,
            name: policy.name,
            version: policy.version,
            enabled: policy.enabled,
            ruleCount: policy.rules.length,
            description: policy.description
          }))
        }
      }
    });
  } catch (error: any) {
    logger.error('Failed to get policy version info:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve policy version information'
    });
  }
});

/**
 * @route GET /api/v1/policy/policies
 * @desc List all available vulnerability scanning policies
 */
router.get('/policies', (_req: Request, res: Response) => {
  try {
    const policies = vulnerabilityScanner.getAvailablePolicies();
    
    res.json({
      status: 'success',
      data: { policies }
    });
  } catch (error: any) {
    logger.error('Failed to get policies:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve policies'
    });
  }
});

/**
 * @route GET /api/v1/policy/policies/enabled
 * @desc List only enabled vulnerability scanning policies
 */
router.get('/policies/enabled', (_req: Request, res: Response) => {
  try {
    const policies = vulnerabilityScanner.getEnabledPolicies();
    
    res.json({
      status: 'success',
      data: { policies }
    });
  } catch (error: any) {
    logger.error('Failed to get enabled policies:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve enabled policies'
    });
  }
});

/**
 * @route GET /api/v1/policy/policies/:policyId
 * @desc Get detailed information about a specific policy
 */
router.get('/policies/:policyId', (req: Request, res: Response) => {
  try {
    const { policyId } = req.params;
    const policy = policyEngine.getPolicy(policyId as string);
    
    if (!policy) {
      res.status(404).json({
        status: 'error',
        error: `Policy not found: ${policyId}`
      });
      return;
    }

    res.json({
      status: 'success',
      data: { policy }
    });
  } catch (error: any) {
    logger.error(`Failed to get policy ${req.params.policyId}:`, error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve policy details'
    });
  }
});

/**
 * @route POST /api/v1/policy/scan
 * @desc Scan source code using the vulnerability policy engine
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { sourceCode, policyIds, options = {} } = req.body;

    // Validate request
    const validation = vulnerabilityScanner.validateScanRequest(sourceCode);
    if (!validation.valid) {
      res.status(400).json({
        status: 'error',
        error: validation.error
      });
      return;
    }

    // Perform scan
    const scanOptions = {
      policyIds: policyIds || undefined,
      strictMode: options.strictMode ?? true,
      mergeResults: options.mergeResults ?? false
    };

    const result = await vulnerabilityScanner.scanContractSource(sourceCode, scanOptions);

    res.json({
      status: 'success',
      data: { result }
    });

  } catch (error: any) {
    logger.error('Policy scan failed:', error);
    if (error.message?.includes('Policy not found')) {
      res.status(400).json({
        status: 'error',
        error: error.message
      });
    } else {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Vulnerability scan failed'
      });
    }
  }
});

/**
 * @route POST /api/v1/policy/validate
 * @desc Validate a policy definition without loading it
 */
router.post('/validate', (req: Request, res: Response) => {
  try {
    const { policy } = req.body;

    if (!policy) {
      res.status(400).json({
        status: 'error',
        error: 'Policy definition is required'
      });
      return;
    }

    // Convert string patterns to RegExp for validation
    const policyToValidate = {
      ...policy,
      rules: policy.rules.map((rule: any) => ({
        ...rule,
        pattern: rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern),
      })),
    };

    const validation = policyEngine.validatePolicy(policyToValidate);
    
    res.json({
      status: 'success',
      data: { validation }
    });

  } catch (error: any) {
    logger.error('Policy validation failed:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Policy validation failed'
    });
  }
});

export default router;