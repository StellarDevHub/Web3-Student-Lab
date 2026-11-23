# Automated Testing Suite Smart Contract

A Soroban smart contract for automated testing of learning modules in the Web3 Student Lab platform.

## Features

- **Learning Modules**: Create structured learning modules with test cases
- **Test Cases**: Define tests with expected results and scoring
- **Automated Testing**: Run test suites and validate results
- **Progress Tracking**: Track user progress and completion
- **Scoring System**: Award points for passing tests

## API

### Module Management
- `create_module(creator, title, description)` - Create a learning module
- `add_test(creator, module_id, title, test_data, expected_result, score)` - Add test to module
- `get_module(module_id)` - Get module details
- `list_modules()` - List all modules

### Test Execution
- `submit_result(user, test_id, actual_result)` - Submit test result
- `run_test_suite(user, module_id)` - Run all tests in a module
- `get_test(test_id)` - Get test details
- `list_module_tests(module_id)` - List tests in a module

### Progress Tracking
- `get_user_progress(user, module_id)` - Get user's progress
- `get_completion(user, module_id)` - Get completion percentage

## Test Status

- `Pending` - Not yet run
- `Running` - Currently executing
- `Passed` - Test succeeded
- `Failed` - Test failed

## Testing

All tests pass with coverage of module creation, test execution, progress tracking, and completion calculation.
