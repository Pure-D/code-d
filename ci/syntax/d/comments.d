// dfmt off
alias baselineCases = AliasSeq!(
    Code!(ubyte, 16 / ubyte.sizeof)([
        /* push   rbp                     */ 0x55,
        /* mov    rbp,rsp                 */ 0x48, 0x8b, 0xec,
        /* movd   xmm0,edi                */ 0x66, 0x0f, 0x6e, 0xc7,
        /* punpcklbw xmm0,xmm0            */ 0x66, 0x0f, 0x60, 0xc0,
        /* punpcklwd xmm0,xmm0            */ 0x66, 0x0f, 0x61, 0xc0,
        /* pshufd xmm0,xmm0,0x0           */ 0x66, 0x0f, 0x70, 0xc0, 0x00,
        /* pop    rbp                     */ 0x5d,
        /* ret                            */ 0xc3,
    ]),
    Code!(ubyte*, 16 / ubyte.sizeof)([
        /* push   rbp                     */ 0x55,
        /* mov    rbp,rsp                 */ 0x48, 0x8b, 0xec,
        /* movzx  eax,BYTE PTR [rdi]      */ 0x0f, 0xb6, 0x07,
        /* movd   xmm0,eax                */ 0x66, 0x0f, 0x6e, 0xc0,
        /* punpcklbw xmm0,xmm0            */ 0x66, 0x0f, 0x60, 0xc0,
        /* punpcklwd xmm0,xmm0            */ 0x66, 0x0f, 0x61, 0xc0,
        /* pshufd xmm0,xmm0,0x0           */ 0x66, 0x0f, 0x70, 0xc0, 0x00,
        /* pop    rbp                     */ 0x5d,
        /* ret                            */ 0xc3,
    ])
);