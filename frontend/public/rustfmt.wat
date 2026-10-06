;; Minimal rustfmt WASM stub for development
;; In production, this would be replaced with actual rustfmt compiled to WASM

(module
  (import "env" "abort" (func $abort))
  
  (memory (export "memory") 10 100)
  
  (global $heap_ptr (mut i32) (i32.const 1024))
  
  ;; alloc(size: i32) -> i32
  (func (export "alloc") (param $size i32) (result i32)
    (local $result i32)
    global.get $heap_ptr
    local.set $result
    global.set $heap_ptr (i32.add (global.get $heap_ptr) (local.get $size))
    local.get $result
  )
  
  ;; dealloc(ptr: i32, size: i32)
  (func (export "dealloc") (param $ptr i32) (param $size i32)
    ;; No-op for bump allocator
  )
  
  ;; rustfmt_format(input_ptr: i32, input_len: i32, output_ptr: i32, output_len: i32) -> i32
  (func (export "rustfmt_format") (param $input_ptr i32) (param $input_len i32) (param $output_ptr i32) (param $output_len i32) (result i32)
    ;; For now, just copy input to output (identity function)
    call $memcpy (local.get $output_ptr) (local.get $input_ptr) (local.get $input_len)
    
    ;; Return output_ptr (success)
    local.get $output_ptr
  )
  
  ;; memcpy(dst: i32, src: i32, len: i32)
  (func $memcpy (param $dst i32) (param $src i32) (param $len i32)
    (local $i i32)
    (local.set $i (i32.const 0))
    (block $exit
      (loop $copy
        local.get $i
        local.get $len
        i32.ge_u
        br_if $exit
        
        local.get $dst
        local.get $i
        i32.add
        local.get $src
        local.get $i
        i32.add
        i32.load8_u
        i32.store8
        
        local.set $i (i32.add (local.get $i) (i32.const 1))
        br $copy
      )
    )
  )
)