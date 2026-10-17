::shader-preview{component="HTMLInCanvas"}
<div style="width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif; color: white;">
  <h1 style="font-size: clamp(24px, 5vw, 56px); font-weight: 800; margin: 0;">Your HTML content here</h1>
</div>
::

## Usage

::code-group{:tabs='["Vue", "React", "Svelte", "Solid", "JS"]'}
```vue-html
<Shader>
  <HTMLInCanvas>
    <div style="width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; color: white;">
      <h1>Your HTML content here</h1>
    </div>
  </HTMLInCanvas>
</Shader>
```

```jsx
<Shader>
  <HTMLInCanvas>
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: 'white' }}>
      <h1>Your HTML content here</h1>
    </div>
  </HTMLInCanvas>
</Shader>
```

```svelte
<Shader>
  <HTMLInCanvas>
    <div style="width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; color: white;">
      <h1>Your HTML content here</h1>
    </div>
  </HTMLInCanvas>
</Shader>
```

```tsx
<Shader>
  <HTMLInCanvas>
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: 'white' }}>
      <h1>Your HTML content here</h1>
    </div>
  </HTMLInCanvas>
</Shader>
```

```javascript
// HTMLInCanvas requires DOM children and is not supported via the JS API.
// Use the Vue, React, Svelte, or Solid packages instead.
```
::
