# Installing a D Compiler

To run D code you first need to build it. To build it a compiler must be
installed on the system.

There are several D compilers to choose from, you can find a list of them under
https://dlang.org/download.html

## DMD

DMD is the official reference compiler for D. It always implements the latest
features and the latest standard library + runtime. Additionally it is the
fastest compiler out of the 3, although it doesn't produce the fastest
executables. It's a good compiler for prototyping and quick scripts and is the
recommended compiler to get if you don't know which one to get.

Download: https://dlang.org/download.html#dmd

## LDC

LDC is an LLVM-based (like clang) D compiler. It supports a variety of operating
systems and target architectures and has very frequent releases, usually being
up-to-date to the DMD reference compiler within days. It takes longer to compile
executables but results in much better optimized executables than with DMD. LDC
is a good compiler to be using in production to create executables.

Installation (package manager): https://github.com/ldc-developers/ldc#installation

Download (executables): https://github.com/ldc-developers/ldc/releases

## GDC

GDC is a GCC-based D compiler. Other than the other compilers, it comes built-in
with GCC and does not require a separate installation. It supports a variety of
operating systems and target architectures. Being tied to GCC's release schedule
it may be behind in new D features. However GDC backports D bug fixes from later
versions in minor updates. GDC could be called the most stable compiler as it is
tied to specific D frontend versions for a while, only fixing issues without big
changes. GDC is a good compiler to be using in production to create executables.

GDC is included in GCC since GCC 9.0, installing a recent GCC version should
have it included by default.

For Linux distributions packaging the backends in different packages or Windows
downloads see https://www.gdcproject.org/downloads

---

The installation packages of DMD and LDC come with various utilities (DUB, rdmd)
installed. If you don't have these utilities because you used your Operating
System's package manager or installed GDC, code-d will download the executables.
