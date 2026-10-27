/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import React from 'react';
import { describe, test, expect } from 'vitest';
import { MarkdownText } from '../ui/MarkdownText';
import { ChatArea } from '../App';
import { type Bubble } from '../App';

describe('Performance benchmark: ChatArea and Markdown', () => {
  test('MarkdownText renders fast', () => {
    const text = "## Heading\n\n" + Array(100).fill("This is a paragraph with *italic* and **bold** text, maybe a [link](http://example.com) too.\n").join("\n");
    const start = performance.now();
    render(<MarkdownText text={text} />);
    const end = performance.now();
    console.log(`Markdown rendering took ${end - start}ms`);
    expect(end - start).toBeLessThan(150);
  });

  test('ChatArea renders fast with virtualized items', () => {
     // Mocking some bubbles
     const messages = Array(150).fill(null).map((_, i) => ({
         id: "msg-" + i,
         role: i % 2 === 0 ? 'user' : 'ai',
         content: "This is message " + i + " with some **markdown**.",
         provider: i % 2 === 0 ? undefined : 'openai',
         final: true
     })) as any;

     const states = {
        openai: { webview: 'loaded', dom: 'ready', login: 'yes', thinking: false, lastStatusAt: 0 }
     } as any;

     const start = performance.now();
     const ref = React.createRef<HTMLDivElement>();
     const { container } = render(<div style={{height: 800, overflow: 'auto'}} ref={ref}><ChatArea messages={messages} locale="en" states={states} scrollElement={ref as any} /></div>);
     const end = performance.now();
     console.log(`ChatArea rendering took ${end - start}ms`);

     // The count of DOM nodes should be relatively small due to virtualization
     const domNodeCount = container.querySelectorAll('*').length;
     console.log(`ChatArea DOM node count: ${domNodeCount}`);
     expect(domNodeCount).toBeLessThan(500); // 150 messages shouldn't render everything if virtualized
  });
});
