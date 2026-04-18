import React from 'react'

// JSX Runtime shim - provides jsx/jsxs functions that match the bundled code's expectations
// jsx/jsxs signature: jsx(type, props, key) where children are in props.children
// React.createElement signature: createElement(type, props, ...children)

function jsx(type: any, props: any, key?: any) {
  const { children, ...restProps } = props || {}
  if (key !== undefined) {
    restProps.key = key
  }
  if (children === undefined) {
    return React.createElement(type, restProps)
  }
  if (Array.isArray(children)) {
    return React.createElement(type, restProps, ...children)
  }
  return React.createElement(type, restProps, children)
}

function jsxs(type: any, props: any, key?: any) {
  return jsx(type, props, key)
}

export const jsxRuntimeExports = {
  jsx,
  jsxs,
  Fragment: React.Fragment,
}

export default jsxRuntimeExports
