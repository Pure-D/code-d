static if (/* hello world */ a is b && is(ushort32)) ushort32[] array;
static assert (/**/ is(typeof(true)));
void main() { if(is(typeof(x)) == 5) {} }