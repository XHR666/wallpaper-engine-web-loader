// Original implementation for this project; API-compatible with the shader includes used here. No third-party code.
//
// common_fragment.h — texture-format identifiers and the small conversion helpers
// that the effect shaders use when a sampler's format is not plain RGBA.
//
// Keep the numeric values: they are the texture format ids this renderer's
// pipeline reports through the TEX0FORMAT / TEX1FORMAT / TEX2FORMAT combos, and
// package shaders compare against them in #if expressions.
//
// The normal-map / PBR lighting helpers that also live in this file historically
// are not used anywhere in this project and are intentionally not carried over.

#define FORMAT_RGBA8888  0
#define FORMAT_RGB888    1
#define FORMAT_RGB565    2

#define FORMAT_ETC1_RGB8 3
#define FORMAT_DXT5      4
#define FORMAT_ETC2_RGBA8 5
#define FORMAT_DXT3      6
#define FORMAT_DXT1      7

#define FORMAT_RG88      8
#define FORMAT_R8        9
#define FORMAT_RG1616F   10
#define FORMAT_R16F      11

#define FORMAT_BC7       12

// Single-channel formats store their value in the red channel.
float ConvertSampleR8(vec4 texel)
{
	return texel.r;
}

// Expands a two-channel (RG) texture into RGB by reusing the green channel, and
// a single-channel (R) texture into an opaque white/grey with the value in red.
vec4 ConvertTexture0Format(vec4 texel)
{
#if TEX0FORMAT == FORMAT_RG88 || TEX0FORMAT == FORMAT_RG1616F
	return texel.rrrg;
#endif
#if TEX0FORMAT == FORMAT_R8 || TEX0FORMAT == FORMAT_R16F
	return vec4(1.0, 1.0, 1.0, texel.r);
#endif
	return texel;
}

// Same conversion for a format id known only at run time.
vec4 ConvertTextureFormat(const int format, vec4 texel)
{
	if (format == FORMAT_RG88 || format == FORMAT_RG1616F)
		return texel.rrrg;
	if (format == FORMAT_R8 || format == FORMAT_R16F)
		return vec4(1.0, 1.0, 1.0, texel.r);
	return texel;
}
