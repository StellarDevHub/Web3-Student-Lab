'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import LessonWorkspace from '@/components/lesson/LessonWorkspace';

/**
 * /lessons — demonstrates the interactive lesson workspace: lesson content on
 * the left, a live Monaco code editor side-panel on the right.
 *
 * This page wires a sample Soroban lesson into {@link LessonWorkspace}; real
 * curriculum data can be passed in the same shape from the course pages.
 */

const SAMPLE_STARTER = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol, symbol_short};

#[contract]
pub struct Greeter;

#[contractimpl]
impl Greeter {
    // TODO: return a greeting Symbol from this function.
    pub fn greet(env: Env) -> Symbol {
        symbol_short!("hello")
    }
}`;

export default function LessonsPage() {
  return (
    <div className="bg-background text-foreground relative min-h-screen overflow-hidden pb-20 transition-colors duration-200">
      {/* Background glows */}
      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-red-600/5 blur-[150px]"></div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-red-600/5 blur-[120px]"></div>

      {/* Navigation */}
      <nav className="bg-bg-secondary/80 border-border-theme relative sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center gap-4">
            <Link
              href="/dashboard"
              className="text-text-secondary hover:text-foreground flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-bold tracking-widest uppercase">Back</span>
            </Link>
            <span className="text-foreground flex items-center gap-2 text-2xl font-black tracking-tighter uppercase">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500"></span>
              Interactive <span className="text-red-600">Lesson</span>
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 border-l-4 border-red-600 py-2 pl-6"
        >
          <h1 className="text-foreground mb-3 text-4xl font-black tracking-tight uppercase md:text-5xl">
            Write Your First <span className="text-red-600">Contract</span>
          </h1>
          <p className="text-text-secondary text-lg font-light tracking-wide">
            Follow the lesson and experiment in the live editor beside it.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <LessonWorkspace title="Your First Soroban Contract" starterCode={SAMPLE_STARTER}>
            <p>
              Soroban contracts are written in Rust. Every contract is a struct
              annotated with <code className="text-foreground">#[contract]</code>, and its callable
              methods live in an <code className="text-foreground">impl</code> block marked
              <code className="text-foreground"> #[contractimpl]</code>.
            </p>
            <p>
              In the editor on the right, the <code className="text-foreground">greet</code> function
              already returns a short symbol. Try editing the returned value, or add a new method
              that takes a name and returns a personalised greeting.
            </p>
            <p>
              The editor provides Rust syntax highlighting and basic autocompletion. Use the
              <span className="text-foreground"> Reset</span> button in the editor header to restore
              the starter code at any time.
            </p>
          </LessonWorkspace>
        </motion.div>
      </main>
    </div>
  );
}
