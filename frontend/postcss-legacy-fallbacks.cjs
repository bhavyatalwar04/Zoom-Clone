/**
 * Fallbacks for browsers that predate CSS features Tailwind v4 emits without one:
 *  - dvh / svh / lvh units (Chrome 108, Safari 15.4): a vh declaration is placed before each one.
 *  - the individual `translate` / `scale` properties (Chrome 104, Safari 14.1): an equivalent
 *    `transform`, applied only in browsers that don't support them.
 * Cascade layers (Chrome 99, Safari 15.4) are flattened by @csstools/postcss-cascade-layers, which
 * runs after this plugin.
 */
const VIEWPORT_UNIT = /(\d)[dsl]vh\b/;
const TRANSFORM_PROPS = new Set(["translate", "scale"]);

/** @type {import("postcss").PluginCreator<void>} */
module.exports = () => ({
  postcssPlugin: "legacy-fallbacks",
  OnceExit(root, { AtRule, Rule, list }) {
    root.walkDecls((decl) => {
      if (VIEWPORT_UNIT.test(decl.value)) {
        decl.cloneBefore({ value: decl.value.replace(new RegExp(VIEWPORT_UNIT, "g"), "$1vh") });
      }

      if (TRANSFORM_PROPS.has(decl.prop) && decl.parent?.type === "rule") {
        const args = list.space(decl.value);
        if (args.length > 2 || decl.value === "none") return;
        const fallback = new AtRule({ name: "supports", params: `not (${decl.prop}: 0)` });
        fallback.append(new Rule({ selector: decl.parent.selector }).append({ prop: "transform", value: `${decl.prop}(${args.join(", ")})` }));
        decl.parent.after(fallback);
      }
    });
  },
});
module.exports.postcss = true;
