export type QuizType = 'multiple-choice' | 'drag-order' | 'code-fill';

export interface BaseQuizQuestion {
  id: string;
  prompt: string;
  hint: string;
  time: number;
}

export interface MultipleChoiceQuestion extends BaseQuizQuestion {
  type: 'multiple-choice';
  options: string[];
  answer: string;
}

export interface DragOrderQuestion extends BaseQuizQuestion {
  type: 'drag-order';
  segments: string[];
  correctOrder: string[];
}

export interface CodeFillQuestion extends BaseQuizQuestion {
  type: 'code-fill';
  snippet: string[];
  choices: string[];
  answer: string;
}

export type QuizQuestion = MultipleChoiceQuestion | DragOrderQuestion | CodeFillQuestion;

export const quizQuestions: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'multiple-choice',
    prompt: 'Which feature is central to Soroban smart contracts on Stellar?',
    hint: 'Soroban uses ledger state and contract storage that is native to Stellar.',
    time: 25,
    options: [
      'EVM-style gas tokens',
      'Ledger entries and contract storage',
      'Solidity ABI encoding',
      'IPFS off-chain storage',
    ],
    answer: 'Ledger entries and contract storage',
  },
  {
    id: 'q2',
    type: 'drag-order',
    prompt: 'Arrange the typical Soroban deployment lifecycle from development to verification.',
    hint: 'Start with source code, then compile, deploy, and finally verify on chain.',
    time: 35,
    segments: [
      'Write Solana smart contract logic in Rust',
      'Compile the contract into WASM',
      'Submit the deployment transaction to the network',
      'Verify the contract ID and runtime behavior',
    ],
    correctOrder: [
      'Write Solana smart contract logic in Rust',
      'Compile the contract into WASM',
      'Submit the deployment transaction to the network',
      'Verify the contract ID and runtime behavior',
    ],
  },
  {
    id: 'q3',
    type: 'code-fill',
    prompt: 'Fill the missing line to build a Soroban transaction using the source account.',
    hint: 'The transaction builder needs the account object, not just an address string.',
    time: 30,
    snippet: [
      'let source_account = Account::new(&public_key);',
      'let tx = TransactionBuilder::new()',
      '    .with_source_account(',
      '      ',
      '    )',
      '    .add_operation(operation)',
      '    .build();',
    ],
    choices: [
      'source_account.clone()',
      'public_key.to_string()',
      'contract_id.into()',
      'env::var("SOURCE")?',
    ],
    answer: 'source_account.clone()',
  },
];
